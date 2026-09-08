import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type {
  GeometryNodeType,
  PanelOrientation,
  Prisma,
  WallType,
  ZoneAssociation,
} from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const MAX_ZONES_PER_DESIGN = 3;

export async function createWall(
  designId: string,
  input: {
    wallType: WallType;
    lengthMm: number;
    heightMm: number;
    cornerAngleDeg?: number | null;
  },
) {
  return prisma.$transaction(async (tx: Tx) => {
    const existing = await tx.wall.findFirst({ where: { designId } });
    if (existing) {
      await tx.geometryNode.delete({ where: { id: existing.id } });
    }

    const id = randomUUID();
    await tx.geometryNode.create({
      data: { id, designId, nodeType: "WALL" as GeometryNodeType, label: "Wall" },
    });
    const wall = await tx.wall.create({
      data: {
        id,
        designId,
        wallType: input.wallType,
        lengthMm: input.lengthMm,
        heightMm: input.heightMm,
        cornerAngleDeg: input.cornerAngleDeg ?? null,
      },
    });

    const edgeRoles: Array<"LEFT" | "RIGHT" | "TOP" | "BOTTOM" | "CORNER"> = [
      "LEFT",
      "RIGHT",
      "TOP",
      "BOTTOM",
    ];
    if (input.wallType === "L_TYPE") edgeRoles.push("CORNER");

    await tx.geometryEdge.createMany({
      data: edgeRoles.map((edgeRole) => ({
        designId,
        nodeId: id,
        edgeRole,
      })),
    });

    const edges = await tx.geometryEdge.findMany({ where: { nodeId: id } });
    return { wall, edges };
  });
}

export async function createZone(
  designId: string,
  input: {
    wallId?: string | null;
    associatesWith: ZoneAssociation;
    orderIndex: number;
    widthMm: number;
    heightMm: number;
    hasCoveLighting?: boolean;
    coveLightZMm?: number | null;
  },
) {
  const zoneCount = await prisma.zone.count({ where: { designId } });
  if (zoneCount >= MAX_ZONES_PER_DESIGN) {
    throw new Error(`A design may have at most ${MAX_ZONES_PER_DESIGN} zones`);
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
        wallId: input.wallId ?? null,
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
  return prisma.$transaction(async (tx: Tx) => {
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
  });
}

export async function createGeometryEdgeRelationship(
  designId: string,
  input: { edgeAId: string; edgeBId: string; relationshipType: "ADJACENCY" },
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
