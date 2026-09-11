import { prisma } from "@/lib/prisma";
import { resolveQuantity, pinSkuVersions } from "@/lib/graph/bom";

export type FinalBomLineInput = {
  skuId: string;
  quantity: number;
  unitOfMeasure: string;
  skuVersionId?: string;
  sourceProjectGeometryProductRelationshipId?: string;
  sourceProjectProductInstanceEdgeId?: string;
  sourceProjectProductInstanceId?: string;
};

/**
 * Project-scoped BOM Resolver -- structurally the same shape as
 * computeMasterBomLines (bom.ts), reusing its exported resolveQuantity/
 * pinSkuVersions unchanged, but iterating the Project's own product graph
 * (ProjectGeometryProductRelationship/ProjectProductInstanceEdge/
 * ProjectProductInstance) instead of the Template's. Deliberately a
 * separate function rather than a shared generic across both product
 * graphs -- the two Prisma types/includes are structurally different enough
 * that forcing one abstraction would add more complexity than it saves for
 * a two-consumer case (same call this codebase already made for
 * src/lib/suggestions.ts in Phase 3).
 */
export async function computeFinalBomLines(projectId: string): Promise<FinalBomLineInput[]> {
  const [geometryProductRelationships, productInstanceEdges, productInstances] = await Promise.all([
    prisma.projectGeometryProductRelationship.findMany({
      where: { projectId },
      include: {
        productInstance: { include: { sku: true } },
        geometryNode: { include: { wall: true, zone: true, partition: true, panel: true } },
        geometryEdge: {
          include: { node: { include: { wall: true, zone: true, partition: true, panel: true } } },
        },
      },
    }),
    prisma.projectProductInstanceEdge.findMany({
      where: { projectId },
      include: { fromInstance: { include: { sku: true } } },
    }),
    prisma.projectProductInstance.findMany({
      where: { projectId },
      include: { sku: true },
    }),
  ]);

  const coveredInstanceIds = new Set<string>();
  for (const rel of geometryProductRelationships) coveredInstanceIds.add(rel.productInstanceId);
  for (const edge of productInstanceEdges) coveredInstanceIds.add(edge.fromInstanceId);

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
      sourceProjectGeometryProductRelationshipId: rel.id,
    })),
    ...productInstanceEdges.map((edge) => ({
      skuId: edge.fromInstance.skuId,
      quantity: edge.fromInstance.quantity,
      unitOfMeasure: edge.fromInstance.sku.defaultUnit,
      skuVersionId: versionIdBySkuId.get(edge.fromInstance.skuId),
      sourceProjectProductInstanceEdgeId: edge.id,
    })),
    ...productInstances
      .filter((instance) => !coveredInstanceIds.has(instance.id))
      .map((instance) => ({
        skuId: instance.skuId,
        quantity: instance.quantity,
        unitOfMeasure: instance.sku.defaultUnit,
        skuVersionId: versionIdBySkuId.get(instance.skuId),
        sourceProjectProductInstanceId: instance.id,
      })),
  ];
}

/**
 * No validation gate, unlike generateMasterBom -- a Project has no
 * lifecycle/status field and no ProjectValidationResult this pass (see the
 * plan file's Phase 5 item 4 section), so a Final BOM can be generated at
 * any time reflecting current Project state. Delete-and-regenerate-in-place
 * + version bump, identical discipline to generateMasterBom, but targets
 * FinalBom/FinalBomLine exclusively -- structurally incapable of touching
 * MasterBom/MasterBomLine, since those tables are never referenced here.
 */
export async function generateFinalBom(projectId: string) {
  const [lineInputs, existingBoms] = await Promise.all([
    computeFinalBomLines(projectId),
    prisma.finalBom.findMany({ where: { projectId } }),
  ]);

  const nextVersion = existingBoms.reduce((max, b) => Math.max(max, b.version), 0) + 1;

  return prisma.$transaction(async (tx) => {
    for (const bom of existingBoms) {
      await tx.finalBom.delete({ where: { id: bom.id } });
    }

    const finalBom = await tx.finalBom.create({
      data: { projectId, version: nextVersion },
    });

    if (lineInputs.length > 0) {
      await tx.finalBomLine.createMany({
        data: lineInputs.map((line) => ({ ...line, finalBomId: finalBom.id })),
      });
    }

    return tx.finalBom.findUniqueOrThrow({
      where: { id: finalBom.id },
      include: { lines: true },
    });
  });
}
