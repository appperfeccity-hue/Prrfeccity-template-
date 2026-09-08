import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api/errors";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Deep-copies a published Template's entire graph into a new DRAFT version.
 * Validation results and Master BOMs are never copied forward -- the new
 * version must be re-validated and re-generate its own BOM from scratch.
 */
export async function reviseTemplate(templateId: string) {
  const parent = await prisma.design.findUnique({ where: { id: templateId } });
  if (!parent) throw badRequest(`Design ${templateId} not found`);
  if (parent.status !== "PUBLISHED") {
    throw badRequest("Only a published Template can be revised");
  }

  return prisma.$transaction(async (tx: Tx) => {
    const child = await tx.design.create({
      data: {
        name: parent.name,
        description: parent.description,
        tags: parent.tags,
        thumbnailUrl: parent.thumbnailUrl,
        version: parent.version + 1,
        status: "DRAFT",
        parentTemplateId: parent.id,
        rootTemplateId: parent.rootTemplateId ?? parent.id,
      },
    });

    const nodeIdMap = new Map<string, string>();
    const edgeIdMap = new Map<string, string>();
    const instanceIdMap = new Map<string, string>();

    const [walls, zones, partitions, panels] = await Promise.all([
      tx.wall.findMany({ where: { designId: templateId } }),
      tx.zone.findMany({ where: { designId: templateId } }),
      tx.zonePartition.findMany({ where: { designId: templateId } }),
      tx.panel.findMany({ where: { designId: templateId } }),
    ]);

    for (const wall of walls) {
      const newId = randomUUID();
      nodeIdMap.set(wall.id, newId);
      await tx.geometryNode.create({
        data: { id: newId, designId: child.id, nodeType: "WALL" },
      });
      await tx.wall.create({
        data: {
          id: newId,
          designId: child.id,
          wallType: wall.wallType,
          lengthMm: wall.lengthMm,
          heightMm: wall.heightMm,
          cornerAngleDeg: wall.cornerAngleDeg,
        },
      });
    }

    for (const zone of zones) {
      const newId = randomUUID();
      nodeIdMap.set(zone.id, newId);
      await tx.geometryNode.create({ data: { id: newId, designId: child.id, nodeType: "ZONE" } });
      await tx.zone.create({
        data: {
          id: newId,
          designId: child.id,
          wallId: zone.wallId ? nodeIdMap.get(zone.wallId) : null,
          associatesWith: zone.associatesWith,
          orderIndex: zone.orderIndex,
          widthMm: zone.widthMm,
          heightMm: zone.heightMm,
          hasCoveLighting: zone.hasCoveLighting,
          coveLightZMm: zone.coveLightZMm,
        },
      });
    }

    for (const partition of partitions) {
      const newId = randomUUID();
      nodeIdMap.set(partition.id, newId);
      await tx.geometryNode.create({ data: { id: newId, designId: child.id, nodeType: "PARTITION" } });
      await tx.zonePartition.create({
        data: {
          id: newId,
          designId: child.id,
          zoneId: nodeIdMap.get(partition.zoneId)!,
          orderIndex: partition.orderIndex,
          widthMm: partition.widthMm,
          heightMm: partition.heightMm,
        },
      });
    }

    for (const panel of panels) {
      const newId = randomUUID();
      nodeIdMap.set(panel.id, newId);
      await tx.geometryNode.create({ data: { id: newId, designId: child.id, nodeType: "PANEL" } });
      await tx.panel.create({
        data: {
          id: newId,
          designId: child.id,
          partitionId: nodeIdMap.get(panel.partitionId)!,
          orderIndex: panel.orderIndex,
          widthMm: panel.widthMm,
          heightMm: panel.heightMm,
          orientation: panel.orientation,
          isOffcut: panel.isOffcut,
          offcutReusable: panel.offcutReusable,
        },
      });
    }

    const edges = await tx.geometryEdge.findMany({ where: { designId: templateId } });
    for (const edge of edges) {
      const newId = randomUUID();
      edgeIdMap.set(edge.id, newId);
      await tx.geometryEdge.create({
        data: {
          id: newId,
          designId: child.id,
          nodeId: nodeIdMap.get(edge.nodeId)!,
          edgeRole: edge.edgeRole,
          requiresTermination: edge.requiresTermination,
          requiresConnector: edge.requiresConnector,
          requiresTrim: edge.requiresTrim,
          isLightingBoundary: edge.isLightingBoundary,
          metadata: edge.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    }

    const edgeRelationships = await tx.geometryEdgeRelationship.findMany({
      where: { designId: templateId },
    });
    for (const rel of edgeRelationships) {
      await tx.geometryEdgeRelationship.create({
        data: {
          designId: child.id,
          edgeAId: edgeIdMap.get(rel.edgeAId)!,
          edgeBId: edgeIdMap.get(rel.edgeBId)!,
          relationshipType: rel.relationshipType,
        },
      });
    }

    const instances = await tx.productInstance.findMany({ where: { designId: templateId } });
    for (const instance of instances) {
      const created = await tx.productInstance.create({
        data: {
          designId: child.id,
          skuId: instance.skuId,
          geometryNodeId: instance.geometryNodeId ? nodeIdMap.get(instance.geometryNodeId) : null,
          x: instance.x,
          y: instance.y,
          z: instance.z,
          rotationDeg: instance.rotationDeg,
          quantity: instance.quantity,
        },
      });
      instanceIdMap.set(instance.id, created.id);
    }

    const instanceEdges = await tx.productInstanceEdge.findMany({ where: { designId: templateId } });
    for (const edge of instanceEdges) {
      await tx.productInstanceEdge.create({
        data: {
          designId: child.id,
          fromInstanceId: instanceIdMap.get(edge.fromInstanceId)!,
          toInstanceId: instanceIdMap.get(edge.toInstanceId)!,
          edgeType: edge.edgeType,
          sourceSkuEdgeId: edge.sourceSkuEdgeId,
          origin: edge.origin,
        },
      });
    }

    const geometryProductRelationships = await tx.geometryProductRelationship.findMany({
      where: { designId: templateId },
    });
    for (const rel of geometryProductRelationships) {
      await tx.geometryProductRelationship.create({
        data: {
          designId: child.id,
          geometryEdgeId: rel.geometryEdgeId ? edgeIdMap.get(rel.geometryEdgeId) : null,
          geometryNodeId: rel.geometryNodeId ? nodeIdMap.get(rel.geometryNodeId) : null,
          productInstanceId: instanceIdMap.get(rel.productInstanceId)!,
          relationshipType: rel.relationshipType,
          condition: rel.condition as Prisma.InputJsonValue | undefined,
          quantityRule: rel.quantityRule as Prisma.InputJsonValue | undefined,
          origin: rel.origin,
        },
      });
    }

    const parameters = await tx.templateParameter.findMany({
      where: { templateId },
      include: { permission: true },
    });
    for (const param of parameters) {
      const newParam = await tx.templateParameter.create({
        data: {
          templateId: child.id,
          targetProductInstanceId: param.targetProductInstanceId
            ? instanceIdMap.get(param.targetProductInstanceId)
            : null,
          targetGeometryEdgeId: param.targetGeometryEdgeId
            ? edgeIdMap.get(param.targetGeometryEdgeId)
            : null,
          paramKey: param.paramKey,
          paramType: param.paramType,
          label: param.label,
          defaultValue: param.defaultValue,
          unit: param.unit,
        },
      });
      if (param.permission) {
        await tx.consultantPermission.create({
          data: {
            templateParameterId: newParam.id,
            editableByConsultant: param.permission.editableByConsultant,
            minValue: param.permission.minValue,
            maxValue: param.permission.maxValue,
            allowedValues: param.permission.allowedValues,
          },
        });
      }
    }

    return child;
  });
}
