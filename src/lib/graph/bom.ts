import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/api/errors";

export type QuantityRule = { type: "FIXED"; value: number } | { type: "PER_LENGTH_MM"; perMm: number };

export type QuantityTargetNode = {
  wallSegment: { lengthMm: number } | null;
  zone: { widthMm: number } | null;
  partition: { widthMm: number } | null;
  panel: { widthMm: number } | null;
} | null;

// Exported -- reused unchanged by src/lib/graph/final-bom.ts, since this
// shape is purely structural and the geometry side is always the literal
// same frozen GeometryNode/GeometryEdge rows regardless of which product
// graph (Template or Project) is asking.
export function resolveQuantity(rel: {
  quantityRule: unknown;
  productInstance: { quantity: number };
  geometryNode: QuantityTargetNode;
  geometryEdge: { node: QuantityTargetNode } | null;
}): number {
  const rule = rel.quantityRule as QuantityRule | null;
  if (!rule) return rel.productInstance.quantity;

  if (rule.type === "FIXED") return rule.value;

  if (rule.type === "PER_LENGTH_MM") {
    const node = rel.geometryNode ?? rel.geometryEdge?.node ?? null;
    const lengthMm =
      node?.wallSegment?.lengthMm ?? node?.zone?.widthMm ?? node?.partition?.widthMm ?? node?.panel?.widthMm ?? null;
    if (lengthMm != null) return lengthMm * rule.perMm;
    return rel.productInstance.quantity;
  }

  return rel.productInstance.quantity;
}

export type BomLineInput = {
  skuId: string;
  quantity: number;
  unitOfMeasure: string;
  skuVersionId?: string;
  sourceGeometryProductRelationshipId?: string;
  sourceProductInstanceEdgeId?: string;
  sourceProductInstanceId?: string;
};

// Resolves each (skuId, version) pair to its frozen SkuMasterVersion row id.
// Exported -- reused unchanged by src/lib/graph/final-bom.ts's resolver, so
// SKU-version pinning has exactly one implementation regardless of which
// product graph is generating a BOM.
export async function pinSkuVersions(skusUsed: Map<string, number>): Promise<Map<string, string>> {
  const versionRows = await prisma.skuMasterVersion.findMany({
    where: { OR: Array.from(skusUsed, ([skuId, version]) => ({ skuId, version })) },
  });
  return new Map(versionRows.map((v) => [v.skuId, v.id]));
}

/**
 * Pure, non-persisting line computation -- iterates provenance sources
 * directly (never aggregates, never synthesizes a missing dependency), same
 * as the persisted generator. Deliberately does NOT gate on the latest
 * validation result: that gate belongs only to the persisted "Generate BOM"
 * path in generateMasterBom, so a live preview can still show what the BOM
 * would contain while validation is failing.
 */
export async function computeMasterBomLines(designId: string): Promise<BomLineInput[]> {
  const [geometryProductRelationships, productInstanceEdges, productInstances] = await Promise.all([
    prisma.geometryProductRelationship.findMany({
      where: { designId },
      include: {
        productInstance: { include: { sku: true } },
        geometryNode: { include: { wallSegment: true, zone: true, partition: true, panel: true } },
        geometryEdge: {
          include: { node: { include: { wallSegment: true, zone: true, partition: true, panel: true } } },
        },
      },
    }),
    prisma.productInstanceEdge.findMany({
      where: { designId },
      include: { fromInstance: { include: { sku: true } } },
    }),
    prisma.productInstance.findMany({
      where: { designId },
      include: { sku: true },
    }),
  ]);

  const coveredInstanceIds = new Set<string>();
  for (const rel of geometryProductRelationships) coveredInstanceIds.add(rel.productInstanceId);
  for (const edge of productInstanceEdges) coveredInstanceIds.add(edge.fromInstanceId);

  // Pin every line to whichever SkuMasterVersion is current *right now* --
  // this is the moment a design's BOM gets frozen (generateMasterBom persists
  // it, and publish then locks the whole design). If the SKU is edited again
  // after this, already-generated lines keep resolving to this exact
  // snapshot, not the newer one.
  const skusUsed = new Map<string, number>();
  for (const rel of geometryProductRelationships) skusUsed.set(rel.productInstance.skuId, rel.productInstance.sku.currentVersion);
  for (const edge of productInstanceEdges) skusUsed.set(edge.fromInstance.skuId, edge.fromInstance.sku.currentVersion);
  for (const instance of productInstances) skusUsed.set(instance.skuId, instance.sku.currentVersion);

  const versionIdBySkuId = await pinSkuVersions(skusUsed);

  return [
    ...geometryProductRelationships.map((rel) => ({
      skuId: rel.productInstance.skuId,
      quantity: resolveQuantity(rel),
      unitOfMeasure: rel.productInstance.sku.defaultUnit,
      skuVersionId: versionIdBySkuId.get(rel.productInstance.skuId),
      sourceGeometryProductRelationshipId: rel.id,
    })),
    ...productInstanceEdges.map((edge) => ({
      skuId: edge.fromInstance.skuId,
      quantity: edge.fromInstance.quantity,
      unitOfMeasure: edge.fromInstance.sku.defaultUnit,
      skuVersionId: versionIdBySkuId.get(edge.fromInstance.skuId),
      sourceProductInstanceEdgeId: edge.id,
    })),
    ...productInstances
      .filter((instance) => !coveredInstanceIds.has(instance.id))
      .map((instance) => ({
        skuId: instance.skuId,
        quantity: instance.quantity,
        unitOfMeasure: instance.sku.defaultUnit,
        skuVersionId: versionIdBySkuId.get(instance.skuId),
        sourceProductInstanceId: instance.id,
      })),
  ];
}

export async function generateMasterBom(designId: string) {
  const latestValidation = await prisma.designValidationResult.findFirst({
    where: { designId },
    orderBy: { ranAt: "desc" },
  });
  if (!latestValidation || !latestValidation.passed) {
    throw conflict("Design must pass validation before generating a Master BOM");
  }

  const [lineInputs, existingBoms] = await Promise.all([
    computeMasterBomLines(designId),
    prisma.masterBom.findMany({ where: { templateId: designId } }),
  ]);

  const nextVersion = existingBoms.reduce((max, b) => Math.max(max, b.version), 0) + 1;

  return prisma.$transaction(async (tx) => {
    for (const bom of existingBoms) {
      await tx.masterBom.delete({ where: { id: bom.id } });
    }

    const masterBom = await tx.masterBom.create({
      data: { templateId: designId, version: nextVersion },
    });

    if (lineInputs.length > 0) {
      await tx.masterBomLine.createMany({
        data: lineInputs.map((line) => ({ ...line, masterBomId: masterBom.id })),
      });
    }

    return tx.masterBom.findUniqueOrThrow({
      where: { id: masterBom.id },
      include: { lines: true },
    });
  });
}
