import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/api/errors";

type QuantityRule = { type: "FIXED"; value: number } | { type: "PER_LENGTH_MM"; perMm: number };

type QuantityTargetNode = {
  wall: { lengthMm: number } | null;
  zone: { widthMm: number } | null;
  partition: { widthMm: number } | null;
  panel: { widthMm: number } | null;
} | null;

function resolveQuantity(rel: {
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
      node?.wall?.lengthMm ?? node?.zone?.widthMm ?? node?.partition?.widthMm ?? node?.panel?.widthMm ?? null;
    if (lengthMm != null) return lengthMm * rule.perMm;
    return rel.productInstance.quantity;
  }

  return rel.productInstance.quantity;
}

export type BomLineInput = {
  skuId: string;
  quantity: number;
  unitOfMeasure: string;
  sourceGeometryProductRelationshipId?: string;
  sourceProductInstanceEdgeId?: string;
  sourceProductInstanceId?: string;
};

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
        geometryNode: { include: { wall: true, zone: true, partition: true, panel: true } },
        geometryEdge: {
          include: { node: { include: { wall: true, zone: true, partition: true, panel: true } } },
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

  return [
    ...geometryProductRelationships.map((rel) => ({
      skuId: rel.productInstance.skuId,
      quantity: resolveQuantity(rel),
      unitOfMeasure: rel.productInstance.sku.defaultUnit,
      sourceGeometryProductRelationshipId: rel.id,
    })),
    ...productInstanceEdges.map((edge) => ({
      skuId: edge.fromInstance.skuId,
      quantity: edge.fromInstance.quantity,
      unitOfMeasure: edge.fromInstance.sku.defaultUnit,
      sourceProductInstanceEdgeId: edge.id,
    })),
    ...productInstances
      .filter((instance) => !coveredInstanceIds.has(instance.id))
      .map((instance) => ({
        skuId: instance.skuId,
        quantity: instance.quantity,
        unitOfMeasure: instance.sku.defaultUnit,
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
