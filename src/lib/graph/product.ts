import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api/errors";
import { assertSkuNotDiscontinued } from "@/lib/graph/sku";
import { resolveWallSegmentId } from "@/lib/graph/geometry";
import type {
  GeometryProductRelationshipType,
  Prisma,
  RelationshipOrigin,
  SkuEdgeType,
} from "@/generated/prisma/client";

type FurnitureOptionIds = {
  designOptionId?: string | null;
  colourOptionId?: string | null;
  sizeOptionId?: string | null;
};

// Enforces "cannot change to an unapproved SKU/option" -- every given option
// id must belong to the instance's own SKU. This is the concrete guard
// behind the domain rule "SKU + Design + Colour + Size -> fixed
// configuration" -- the Canvas/Inspector may only pick from the approved
// catalogue, never assemble an arbitrary combination.
export async function assertOptionsBelongToSku(skuId: string, options: FurnitureOptionIds) {
  const [design, colour, size] = await Promise.all([
    options.designOptionId ? prisma.furnitureDesignOption.findUnique({ where: { id: options.designOptionId } }) : null,
    options.colourOptionId ? prisma.furnitureColourOption.findUnique({ where: { id: options.colourOptionId } }) : null,
    options.sizeOptionId ? prisma.furnitureSizeOption.findUnique({ where: { id: options.sizeOptionId } }) : null,
  ]);
  if (options.designOptionId && (!design || design.skuId !== skuId)) {
    throw badRequest("designOptionId does not belong to this SKU");
  }
  if (options.colourOptionId && (!colour || colour.skuId !== skuId)) {
    throw badRequest("colourOptionId does not belong to this SKU");
  }
  if (options.sizeOptionId && (!size || size.skuId !== skuId)) {
    throw badRequest("sizeOptionId does not belong to this SKU");
  }
}

export async function createProductInstance(
  designId: string,
  input: {
    skuId: string;
    geometryNodeId?: string | null;
    wallSegmentId?: string | null;
    x?: number | null;
    y?: number | null;
    z?: number | null;
    rotationDeg?: number;
    quantity?: number;
    designOptionId?: string | null;
    colourOptionId?: string | null;
    sizeOptionId?: string | null;
  },
) {
  const sku = await prisma.skuMaster.findUnique({ where: { id: input.skuId } });
  if (!sku) throw notFound(`SKU ${input.skuId} not found`);
  assertSkuNotDiscontinued(sku);
  await assertOptionsBelongToSku(input.skuId, input);
  // A geometry-attached instance's segment membership is already implied by
  // its geometryNodeId (that node belongs to exactly one segment via its
  // Zone/Partition/Panel chain) -- only freestanding instances (no
  // geometryNodeId) need resolveWallSegmentId's auto-default/ambiguity
  // check, matching the same distinction Fixture's own resolution makes.
  const wallSegmentId = input.geometryNodeId
    ? (input.wallSegmentId ?? null)
    : await resolveWallSegmentId(designId, input.wallSegmentId);

  return prisma.productInstance.create({
    data: {
      designId,
      skuId: input.skuId,
      geometryNodeId: input.geometryNodeId ?? null,
      wallSegmentId,
      x: input.x ?? null,
      y: input.y ?? null,
      z: input.z ?? null,
      rotationDeg: input.rotationDeg ?? 0,
      quantity: input.quantity ?? 1,
      designOptionId: input.designOptionId ?? null,
      colourOptionId: input.colourOptionId ?? null,
      sizeOptionId: input.sizeOptionId ?? null,
    },
  });
}

export async function updateProductInstance(
  instanceId: string,
  input: {
    wallSegmentId?: string | null;
    x?: number;
    y?: number;
    z?: number;
    rotationDeg?: number;
    quantity?: number;
    designOptionId?: string | null;
    colourOptionId?: string | null;
    sizeOptionId?: string | null;
  },
) {
  const existing = await prisma.productInstance.findUnique({
    where: { id: instanceId },
    include: { sku: true },
  });
  if (!existing) throw notFound(`Product instance ${instanceId} not found`);

  if (
    input.rotationDeg !== undefined &&
    input.rotationDeg !== existing.rotationDeg &&
    !existing.sku.rotatable
  ) {
    throw badRequest("This product's catalogue configuration does not permit rotation");
  }

  const hasOptionChange =
    input.designOptionId !== undefined || input.colourOptionId !== undefined || input.sizeOptionId !== undefined;
  if (hasOptionChange) {
    await assertOptionsBelongToSku(existing.skuId, input);
  }

  const data: typeof input = { ...input };
  if (input.wallSegmentId !== undefined) {
    data.wallSegmentId = await resolveWallSegmentId(existing.designId, input.wallSegmentId);
  }

  return prisma.productInstance.update({
    where: { id: instanceId },
    data,
  });
}

export async function deleteProductInstance(instanceId: string) {
  await prisma.productInstance.delete({ where: { id: instanceId } });
}

export async function createGeometryProductRelationship(
  designId: string,
  input: {
    geometryEdgeId?: string | null;
    geometryNodeId?: string | null;
    productInstanceId: string;
    relationshipType: GeometryProductRelationshipType;
    condition?: unknown;
    quantityRule?: unknown;
    origin?: RelationshipOrigin;
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
      condition: input.condition as Prisma.InputJsonValue | undefined,
      quantityRule: input.quantityRule as Prisma.InputJsonValue | undefined,
      origin: input.origin ?? "DESIGNER_DEFINED",
    },
  });
}

export async function deleteGeometryProductRelationship(relationshipId: string) {
  await prisma.geometryProductRelationship.delete({ where: { id: relationshipId } });
}

export async function createProductInstanceEdge(
  designId: string,
  input: {
    fromInstanceId: string;
    toInstanceId: string;
    edgeType: SkuEdgeType;
    sourceSkuEdgeId?: string | null;
    origin?: RelationshipOrigin;
  },
) {
  return prisma.productInstanceEdge.create({
    data: {
      designId,
      fromInstanceId: input.fromInstanceId,
      toInstanceId: input.toInstanceId,
      edgeType: input.edgeType,
      sourceSkuEdgeId: input.sourceSkuEdgeId ?? null,
      origin: input.origin ?? "DESIGNER_DEFINED",
    },
  });
}

export async function deleteProductInstanceEdge(edgeId: string) {
  await prisma.productInstanceEdge.delete({ where: { id: edgeId } });
}
