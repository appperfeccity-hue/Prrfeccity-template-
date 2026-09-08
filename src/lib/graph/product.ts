import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api/errors";
import type { GeometryProductRelationshipType, SkuEdgeType } from "@/generated/prisma/client";

export async function createProductInstance(
  designId: string,
  input: {
    skuId: string;
    geometryNodeId?: string | null;
    x?: number | null;
    y?: number | null;
    z?: number | null;
    rotationDeg?: number;
    quantity?: number;
  },
) {
  return prisma.productInstance.create({
    data: {
      designId,
      skuId: input.skuId,
      geometryNodeId: input.geometryNodeId ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      z: input.z ?? null,
      rotationDeg: input.rotationDeg ?? 0,
      quantity: input.quantity ?? 1,
    },
  });
}

export async function createGeometryProductRelationship(
  designId: string,
  input: {
    geometryEdgeId?: string | null;
    geometryNodeId?: string | null;
    productInstanceId: string;
    relationshipType: GeometryProductRelationshipType;
  },
) {
  const hasEdge = Boolean(input.geometryEdgeId);
  const hasNode = Boolean(input.geometryNodeId);
  if (hasEdge === hasNode) {
    throw badRequest("Exactly one of geometryEdgeId or geometryNodeId must be set");
  }

  return prisma.geometryProductRelationship.create({
    data: {
      designId,
      geometryEdgeId: input.geometryEdgeId ?? null,
      geometryNodeId: input.geometryNodeId ?? null,
      productInstanceId: input.productInstanceId,
      relationshipType: input.relationshipType,
    },
  });
}

export async function createProductInstanceEdge(
  designId: string,
  input: {
    fromInstanceId: string;
    toInstanceId: string;
    edgeType: SkuEdgeType;
    sourceSkuEdgeId?: string | null;
  },
) {
  return prisma.productInstanceEdge.create({
    data: {
      designId,
      fromInstanceId: input.fromInstanceId,
      toInstanceId: input.toInstanceId,
      edgeType: input.edgeType,
      sourceSkuEdgeId: input.sourceSkuEdgeId ?? null,
    },
  });
}
