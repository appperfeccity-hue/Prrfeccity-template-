import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api/errors";
import { WIDTH_TOLERANCE_MM } from "@/lib/graph/constants";
import { assertSkuNotDiscontinued } from "@/lib/graph/sku";
import type {
  GeometryEdgeRelationshipType,
  GeometryNodeType,
  Panel,
  PanelOrientation,
  Prisma,
  ProductInstance,
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
