import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api/errors";
import { MAX_WALL_SEGMENTS_PER_DESIGN, WIDTH_TOLERANCE_MM } from "@/lib/graph/constants";
import { assertSkuNotDiscontinued } from "@/lib/graph/sku";
import type {
  GeometryEdgeRelationshipType,
  GeometryNodeType,
  Panel,
  PanelOrientation,
  Prisma,
  ProductInstance,
  ZoneAssociation,
} from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const MAX_ZONES_PER_SEGMENT = 3;

// Creates-or-replaces the design's first (sequence 0) wall segment -- same
// delete-and-recreate-via-GeometryNode-cascade shape as the old single-wall
// createWall. Rejected if a second segment already exists: replacing the
// anchor segment out from under an existing junction would silently
// invalidate the junction's meaning. The Designer must delete segment 2
// first (which cascades its junction, see deleteWallSegment).
export async function createWallSegment(
  designId: string,
  input: { lengthMm: number; heightMm: number },
) {
  return prisma.$transaction(async (tx: Tx) => {
    const hasSecond = await tx.wallSegment.count({ where: { designId, sequence: 1 } });
    if (hasSecond > 0) {
      throw badRequest("Delete the second wall segment before replacing the first");
    }

    const existing = await tx.wallSegment.findUnique({
      where: { designId_sequence: { designId, sequence: 0 } },
    });
    if (existing) {
      await tx.geometryNode.delete({ where: { id: existing.id } });
    }

    const id = randomUUID();
    await tx.geometryNode.create({
      data: { id, designId, nodeType: "WALL" as GeometryNodeType, label: "Wall Segment 1" },
    });
    const segment = await tx.wallSegment.create({
      data: { id, designId, sequence: 0, lengthMm: input.lengthMm, heightMm: input.heightMm },
    });

    await tx.geometryEdge.createMany({
      data: (["LEFT", "RIGHT", "TOP", "BOTTOM"] as const).map((edgeRole) => ({
        designId,
        nodeId: id,
        edgeRole,
      })),
    });

    const edges = await tx.geometryEdge.findMany({ where: { nodeId: id } });
    return { segment, edges };
  });
}

// Appends the design's second segment PLUS the junction connecting it to
// segment 0, in one call -- a junction is meaningless without both
// endpoints, so there is no valid intermediate state where segment 2 exists
// with no junction.
export async function addWallSegment(
  designId: string,
  input: { lengthMm: number; heightMm: number; angleDeg: number },
) {
  return prisma.$transaction(async (tx: Tx) => {
    const first = await tx.wallSegment.findUnique({
      where: { designId_sequence: { designId, sequence: 0 } },
    });
    if (!first) throw badRequest("Create the first wall segment before adding a second");

    const count = await tx.wallSegment.count({ where: { designId } });
    if (count >= MAX_WALL_SEGMENTS_PER_DESIGN) {
      throw badRequest(`A design may have at most ${MAX_WALL_SEGMENTS_PER_DESIGN} wall segments`);
    }

    const id = randomUUID();
    await tx.geometryNode.create({
      data: { id, designId, nodeType: "WALL" as GeometryNodeType, label: "Wall Segment 2" },
    });
    const segment = await tx.wallSegment.create({
      data: { id, designId, sequence: 1, lengthMm: input.lengthMm, heightMm: input.heightMm },
    });

    await tx.geometryEdge.createMany({
      data: (["LEFT", "RIGHT", "TOP", "BOTTOM"] as const).map((edgeRole) => ({
        designId,
        nodeId: id,
        edgeRole,
      })),
    });

    await tx.wallJunction.create({
      data: { designId, segmentAId: first.id, segmentBId: id, angleDeg: input.angleDeg },
    });

    const edges = await tx.geometryEdge.findMany({ where: { nodeId: id } });
    return { segment, edges };
  });
}

// In-place dimension edit -- id/GeometryNode identity unchanged, so any
// Zone/Fixture/ProductInstance already pointing at this segment is
// unaffected. Distinct from createWallSegment's replace-by-recreation, which
// only applies to segment 0's very first creation / a from-scratch redo.
export async function updateWallSegmentDimensions(
  segmentId: string,
  input: { lengthMm?: number; heightMm?: number },
) {
  const existing = await prisma.wallSegment.findUnique({ where: { id: segmentId } });
  if (!existing) throw notFound(`Wall segment ${segmentId} not found`);
  return prisma.wallSegment.update({ where: { id: segmentId }, data: input });
}

export async function updateWallJunctionAngle(junctionId: string, angleDeg: number) {
  const existing = await prisma.wallJunction.findUnique({ where: { id: junctionId } });
  if (!existing) throw notFound(`Wall junction ${junctionId} not found`);
  return prisma.wallJunction.update({ where: { id: junctionId }, data: { angleDeg } });
}

// Deletes a wall segment. Deleting segment 1 cascades its WallJunction row
// (via segmentB's onDelete: Cascade). Deleting segment 0 while segment 1
// still exists is rejected -- mirroring createWallSegment's own replace
// guard, the only path to remove segment 0 is: delete segment 1 first, then
// replace/recreate segment 0.
export async function deleteWallSegment(designId: string, segmentId: string) {
  const segment = await prisma.wallSegment.findUnique({ where: { id: segmentId } });
  if (!segment) throw notFound(`Wall segment ${segmentId} not found`);
  if (segment.sequence === 0) {
    const hasSecond = await prisma.wallSegment.count({ where: { designId, sequence: 1 } });
    if (hasSecond > 0) throw badRequest("Delete the second wall segment first");
  }
  await prisma.geometryNode.delete({ where: { id: segmentId } });
}

// Resolves which WallSegment a Fixture/ProductInstance's mm coordinates are
// measured in. If the caller supplies an id, it's validated to belong to
// this design. Otherwise: auto-defaults to the design's sole segment when
// unambiguous (preserving every single-segment caller's ergonomics
// unchanged); returns null when the design has no segment yet (caller's own
// precondition checks apply); throws 400 once 2 segments exist and none was
// specified -- "nothing silently invented, explicit once ambiguous".
export async function resolveWallSegmentId(
  designId: string,
  provided: string | null | undefined,
): Promise<string | null> {
  if (provided) {
    const exists = await prisma.wallSegment.count({ where: { id: provided, designId } });
    if (!exists) throw notFound(`Wall segment ${provided} not found in this design`);
    return provided;
  }
  const segments = await prisma.wallSegment.findMany({ where: { designId }, select: { id: true } });
  if (segments.length === 1) return segments[0].id;
  if (segments.length === 0) return null;
  throw badRequest("wallSegmentId is required once a design has more than one wall segment");
}

export async function createZone(
  designId: string,
  input: {
    wallSegmentId: string;
    associatesWith: ZoneAssociation;
    orderIndex: number;
    widthMm: number;
    heightMm: number;
    hasCoveLighting?: boolean;
    coveLightZMm?: number | null;
  },
) {
  const zoneCount = await prisma.zone.count({ where: { wallSegmentId: input.wallSegmentId } });
  if (zoneCount >= MAX_ZONES_PER_SEGMENT) {
    throw new Error(`A wall segment may have at most ${MAX_ZONES_PER_SEGMENT} zones`);
  }

  return prisma.$transaction(async (tx: Tx) => {
    const id = randomUUID();
    await tx.geometryNode.create({
      data: { id, designId, nodeType: "ZONE" as GeometryNodeType, label: `Zone ${input.orderIndex}` },
    });
    const zone = await tx.zone.create({
      data: {
        id,
        designId,
        wallSegmentId: input.wallSegmentId,
        associatesWith: input.associatesWith,
        orderIndex: input.orderIndex,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
        hasCoveLighting: input.hasCoveLighting ?? false,
        coveLightZMm: input.coveLightZMm ?? null,
      },
    });

    await tx.geometryEdge.createMany({
      data: [
        { designId, nodeId: id, edgeRole: "OUTER_BOUNDARY" },
        { designId, nodeId: id, edgeRole: "INNER_BOUNDARY" },
      ],
    });

    const edges = await tx.geometryEdge.findMany({ where: { nodeId: id } });
    return { zone, edges };
  });
}

export async function createPartition(
  designId: string,
  zoneId: string,
  input: { orderIndex: number; widthMm: number; heightMm: number },
) {
  return prisma.$transaction(async (tx: Tx) => {
    const id = randomUUID();
    await tx.geometryNode.create({
      data: {
        id,
        designId,
        nodeType: "PARTITION" as GeometryNodeType,
        label: `Partition ${input.orderIndex}`,
      },
    });
    const partition = await tx.zonePartition.create({
      data: {
        id,
        designId,
        zoneId,
        orderIndex: input.orderIndex,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
      },
    });
    return partition;
  });
}

async function createPanelTx(
  tx: Tx,
  designId: string,
  partitionId: string,
  input: {
    orderIndex: number;
    widthMm: number;
    heightMm: number;
    orientation: PanelOrientation;
    isOffcut?: boolean;
    offcutReusable?: boolean | null;
  },
) {
  const id = randomUUID();
  await tx.geometryNode.create({
    data: {
      id,
      designId,
      nodeType: "PANEL" as GeometryNodeType,
      label: `Panel ${input.orderIndex}`,
    },
  });
  const panel = await tx.panel.create({
    data: {
      id,
      designId,
      partitionId,
      orderIndex: input.orderIndex,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      orientation: input.orientation,
      isOffcut: input.isOffcut ?? false,
      offcutReusable: input.offcutReusable ?? null,
    },
  });

  await tx.geometryEdge.createMany({
    data: [
      { designId, nodeId: id, edgeRole: "PARTITION_EDGE", metadata: { side: "start" } },
      { designId, nodeId: id, edgeRole: "PARTITION_EDGE", metadata: { side: "end" } },
    ],
  });

  const edges = await tx.geometryEdge.findMany({ where: { nodeId: id } });
  return { panel, edges };
}

export async function createPanel(
  designId: string,
  partitionId: string,
  input: {
    orderIndex: number;
    widthMm: number;
    heightMm: number;
    orientation: PanelOrientation;
  },
) {
  return prisma.$transaction((tx: Tx) => createPanelTx(tx, designId, partitionId, input));
}

export async function updatePanel(
  panelId: string,
  input: { widthMm?: number; orientation?: PanelOrientation },
) {
  return prisma.panel.update({
    where: { id: panelId },
    data: input,
  });
}

export async function deleteGeometryNode(nodeId: string) {
  await prisma.geometryNode.delete({ where: { id: nodeId } });
}

// The one geometry-primitive kind with a full domain-function/API/rendering
// build-out this pass (Phase 6 item 1) -- see the plan file for why LINE was
// chosen as the reference implementation. Follows the same shared-PK
// transaction shape as createWallSegment/createZone/createPanelTx, minus the
// bulk GeometryEdge.createMany call those make -- primitives get no edges
// this pass. Deletion reuses the existing generic deleteGeometryNode above
// unchanged; no new delete function is needed.
export async function createGeometryPrimitiveLine(
  designId: string,
  input: { startXMm: number; startYMm: number; endXMm: number; endYMm: number; label?: string },
) {
  return prisma.$transaction(async (tx: Tx) => {
    const id = randomUUID();
    await tx.geometryNode.create({
      data: {
        id,
        designId,
        nodeType: "PRIMITIVE" as GeometryNodeType,
        primitiveKind: "LINE",
        label: input.label ?? null,
      },
    });
    const line = await tx.geometryPrimitiveLine.create({
      data: {
        id,
        designId,
        startXMm: input.startXMm,
        startYMm: input.startYMm,
        endXMm: input.endXMm,
        endYMm: input.endYMm,
      },
    });
    return line;
  });
}

// Phase 6 item 2: extends the vertical slice LINE established to the
// remaining 4 primitive kinds -- same shared-PK transaction shape, no
// GeometryEdge rows, deletion still reuses the generic deleteGeometryNode
// above.
export async function createGeometryPrimitiveRectangle(
  designId: string,
  input: { xMm: number; yMm: number; widthMm: number; heightMm: number; rotationDeg?: number; label?: string },
) {
  return prisma.$transaction(async (tx: Tx) => {
    const id = randomUUID();
    await tx.geometryNode.create({
      data: {
        id,
        designId,
        nodeType: "PRIMITIVE" as GeometryNodeType,
        primitiveKind: "RECTANGLE",
        label: input.label ?? null,
      },
    });
    return tx.geometryPrimitiveRectangle.create({
      data: {
        id,
        designId,
        xMm: input.xMm,
        yMm: input.yMm,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
        rotationDeg: input.rotationDeg ?? 0,
      },
    });
  });
}

// >=2 points enforced here too (not just zod) since tests/geometry-primitive.test.ts
// exercises this function directly, bypassing API-layer validation entirely.
export async function createGeometryPrimitivePolyline(
  designId: string,
  input: { points: { xMm: number; yMm: number; bulge?: number }[]; closed?: boolean; label?: string },
) {
  if (input.points.length < 2) throw badRequest("A polyline requires at least 2 points");
  return prisma.$transaction(async (tx: Tx) => {
    const id = randomUUID();
    await tx.geometryNode.create({
      data: {
        id,
        designId,
        nodeType: "PRIMITIVE" as GeometryNodeType,
        primitiveKind: "POLYLINE",
        label: input.label ?? null,
      },
    });
    const polyline = await tx.geometryPrimitivePolyline.create({
      data: { id, designId, closed: input.closed ?? false },
    });
    await tx.geometryPrimitivePolylinePoint.createMany({
      data: input.points.map((p, index) => ({
        polylineId: id,
        sequenceIndex: index,
        xMm: p.xMm,
        yMm: p.yMm,
        bulge: p.bulge ?? 0,
      })),
    });
    const points = await tx.geometryPrimitivePolylinePoint.findMany({
      where: { polylineId: id },
      orderBy: { sequenceIndex: "asc" },
    });
    return { ...polyline, points };
  });
}

export async function createGeometryPrimitiveArc(
  designId: string,
  input: {
    centerXMm: number;
    centerYMm: number;
    radiusMm: number;
    startAngleDeg: number;
    sweepAngleDeg: number;
    label?: string;
  },
) {
  return prisma.$transaction(async (tx: Tx) => {
    const id = randomUUID();
    await tx.geometryNode.create({
      data: {
        id,
        designId,
        nodeType: "PRIMITIVE" as GeometryNodeType,
        primitiveKind: "ARC",
        label: input.label ?? null,
      },
    });
    return tx.geometryPrimitiveArc.create({
      data: {
        id,
        designId,
        centerXMm: input.centerXMm,
        centerYMm: input.centerYMm,
        radiusMm: input.radiusMm,
        startAngleDeg: input.startAngleDeg,
        sweepAngleDeg: input.sweepAngleDeg,
      },
    });
  });
}

export async function createGeometryPrimitiveCircle(
  designId: string,
  input: { centerXMm: number; centerYMm: number; radiusMm: number; label?: string },
) {
  return prisma.$transaction(async (tx: Tx) => {
    const id = randomUUID();
    await tx.geometryNode.create({
      data: {
        id,
        designId,
        nodeType: "PRIMITIVE" as GeometryNodeType,
        primitiveKind: "CIRCLE",
        label: input.label ?? null,
      },
    });
    return tx.geometryPrimitiveCircle.create({
      data: { id, designId, centerXMm: input.centerXMm, centerYMm: input.centerYMm, radiusMm: input.radiusMm },
    });
  });
}

export async function createGeometryEdgeRelationship(
  designId: string,
  input: { edgeAId: string; edgeBId: string; relationshipType: GeometryEdgeRelationshipType },
) {
  const [edgeA, edgeB] = await Promise.all([
    prisma.geometryEdge.findFirst({ where: { id: input.edgeAId, designId } }),
    prisma.geometryEdge.findFirst({ where: { id: input.edgeBId, designId } }),
  ]);
  if (!edgeA || !edgeB) {
    throw new Error("Both edges must belong to this design");
  }

  return prisma.geometryEdgeRelationship.create({
    data: {
      designId,
      edgeAId: input.edgeAId,
      edgeBId: input.edgeBId,
      relationshipType: input.relationshipType,
    },
  });
}

export async function deleteGeometryEdgeRelationship(relationshipId: string) {
  await prisma.geometryEdgeRelationship.delete({ where: { id: relationshipId } });
}

export async function autoFillPartition(designId: string, partitionId: string, skuId: string) {
  const [partition, sku, existingPanels] = await Promise.all([
    prisma.zonePartition.findFirst({ where: { id: partitionId, designId } }),
    prisma.skuMaster.findUnique({ where: { id: skuId }, include: { category: true } }),
    prisma.panel.findMany({ where: { partitionId } }),
  ]);

  if (!partition) throw notFound(`Partition ${partitionId} not found in this design`);
  if (existingPanels.length > 0) {
    throw badRequest("Auto-fill only applies to an empty partition");
  }
  if (!sku) throw notFound(`SKU ${skuId} not found`);
  assertSkuNotDiscontinued(sku);
  if (sku.category.key !== "PRIMARY") {
    throw badRequest("Auto-fill requires a PRIMARY-category panel SKU");
  }
  if (sku.defaultWidthMm == null) {
    throw badRequest("SKU must have a defaultWidthMm to be used for auto-fill");
  }

  const partitionWidthMm = partition.widthMm;
  const panelWidthMm = sku.defaultWidthMm;

  const rawCount = Math.floor((partitionWidthMm + WIDTH_TOLERANCE_MM) / panelWidthMm);
  if (rawCount === 0) {
    throw badRequest("Partition is narrower than one panel width");
  }
  const rawRemainder = partitionWidthMm - rawCount * panelWidthMm;

  let count = rawCount;
  let remainder = rawRemainder;
  if (
    rawRemainder > WIDTH_TOLERANCE_MM &&
    sku.minCutPieceMm != null &&
    rawRemainder < sku.minCutPieceMm &&
    rawCount > 1
  ) {
    count = rawCount - 1;
    remainder = partitionWidthMm - count * panelWidthMm;
  }

  const hasOffcut = remainder > WIDTH_TOLERANCE_MM;
  const offcutReusable = hasOffcut
    ? sku.minCutPieceMm == null || remainder >= sku.minCutPieceMm
    : null;

  const result = await prisma.$transaction(async (tx: Tx) => {
    const panels: { panel: Panel; edges: Awaited<ReturnType<typeof createPanelTx>>["edges"]; productInstance: ProductInstance | null }[] = [];

    for (let i = 0; i < count; i++) {
      const { panel, edges } = await createPanelTx(tx, designId, partitionId, {
        orderIndex: i,
        widthMm: panelWidthMm,
        heightMm: partition.heightMm,
        orientation: "VERTICAL",
      });
      const productInstance = await tx.productInstance.create({
        data: { designId, skuId, geometryNodeId: panel.id, quantity: 1 },
      });
      panels.push({ panel, edges, productInstance });
    }

    if (hasOffcut) {
      const { panel, edges } = await createPanelTx(tx, designId, partitionId, {
        orderIndex: count,
        widthMm: remainder,
        heightMm: partition.heightMm,
        orientation: "VERTICAL",
        isOffcut: true,
        offcutReusable,
      });
      panels.push({ panel, edges, productInstance: null });
    }

    return panels;
  });

  return {
    partition,
    panels: result,
    fill: { count, panelWidthMm, remainderMm: remainder, hasOffcut, offcutReusable },
  };
}
