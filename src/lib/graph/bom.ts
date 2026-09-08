import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/api/errors";

export async function generateMasterBom(designId: string) {
  const latestValidation = await prisma.designValidationResult.findFirst({
    where: { designId },
    orderBy: { ranAt: "desc" },
  });
  if (!latestValidation || !latestValidation.passed) {
    throw conflict("Design must pass validation before generating a Master BOM");
  }

  const [geometryProductRelationships, productInstanceEdges, productInstances, existingBoms] =
    await Promise.all([
      prisma.geometryProductRelationship.findMany({
        where: { designId },
        include: { productInstance: { include: { sku: true } } },
      }),
      prisma.productInstanceEdge.findMany({
        where: { designId },
        include: { fromInstance: { include: { sku: true } } },
      }),
      prisma.productInstance.findMany({
        where: { designId },
        include: { sku: true },
      }),
      prisma.masterBom.findMany({ where: { templateId: designId } }),
    ]);

  const coveredInstanceIds = new Set<string>();
  for (const rel of geometryProductRelationships) coveredInstanceIds.add(rel.productInstanceId);
  for (const edge of productInstanceEdges) coveredInstanceIds.add(edge.fromInstanceId);

  const nextVersion = existingBoms.reduce((max, b) => Math.max(max, b.version), 0) + 1;

  return prisma.$transaction(async (tx) => {
    for (const bom of existingBoms) {
      await tx.masterBom.delete({ where: { id: bom.id } });
    }

    const masterBom = await tx.masterBom.create({
      data: { templateId: designId, version: nextVersion },
    });

    const lineData = [
      ...geometryProductRelationships.map((rel) => ({
        masterBomId: masterBom.id,
        skuId: rel.productInstance.skuId,
        quantity: rel.productInstance.quantity,
        unitOfMeasure: rel.productInstance.sku.defaultUnit,
        sourceGeometryProductRelationshipId: rel.id,
      })),
      ...productInstanceEdges.map((edge) => ({
        masterBomId: masterBom.id,
        skuId: edge.fromInstance.skuId,
        quantity: edge.fromInstance.quantity,
        unitOfMeasure: edge.fromInstance.sku.defaultUnit,
        sourceProductInstanceEdgeId: edge.id,
      })),
      ...productInstances
        .filter((instance) => !coveredInstanceIds.has(instance.id))
        .map((instance) => ({
          masterBomId: masterBom.id,
          skuId: instance.skuId,
          quantity: instance.quantity,
          unitOfMeasure: instance.sku.defaultUnit,
          sourceProductInstanceId: instance.id,
        })),
    ];

    if (lineData.length > 0) {
      await tx.masterBomLine.createMany({ data: lineData });
    }

    return tx.masterBom.findUniqueOrThrow({
      where: { id: masterBom.id },
      include: { lines: true },
    });
  });
}
