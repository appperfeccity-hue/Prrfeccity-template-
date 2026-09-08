import { prisma } from "@/lib/prisma";
import { createWall, createZone, createPartition, createPanel } from "@/lib/graph/geometry";
import {
  createProductInstance,
  createGeometryProductRelationship,
  createProductInstanceEdge,
} from "@/lib/graph/product";

async function skuIdByCode(code: string) {
  const sku = await prisma.skuMaster.findUniqueOrThrow({ where: { code } });
  return sku.id;
}

async function skuEdgeId(
  fromCode: string,
  toCode: string,
  edgeType: "REQUIRES" | "TERMINATES_WITH" | "SUPPORTS" | "CONNECTS_TO" | "COMPATIBLE_WITH" | "INTERACTS_WITH" | "INSTALLED_WITH",
) {
  const fromSkuId = await skuIdByCode(fromCode);
  const toSkuId = await skuIdByCode(toCode);
  const edge = await prisma.skuEdge.findFirstOrThrow({ where: { fromSkuId, toSkuId, edgeType } });
  return edge.id;
}

/** Builds a single-zone, single-partition, single-panel template that should pass every validation rule. */
export async function buildValidTemplateFixture() {
  const design = await prisma.design.create({ data: { name: "Fixture Template" } });

  const { wall } = await createWall(design.id, {
    wallType: "STRAIGHT_LTR",
    lengthMm: 1200,
    heightMm: 2400,
  });

  const { zone } = await createZone(design.id, {
    wallId: wall.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 1200,
    heightMm: 2400,
    hasCoveLighting: true,
    coveLightZMm: 1800,
  });

  const partition = await createPartition(design.id, zone.id, {
    orderIndex: 0,
    widthMm: 1200,
    heightMm: 2400,
  });

  const { panel, edges: panelEdges } = await createPanel(design.id, partition.id, {
    orderIndex: 0,
    widthMm: 1200,
    heightMm: 2400,
    orientation: "VERTICAL",
  });
  const [edgeStart, edgeEnd] = panelEdges;

  await prisma.geometryEdge.update({
    where: { id: edgeStart.id },
    data: { requiresTrim: true, requiresConnector: true, requiresTermination: true },
  });
  await prisma.geometryEdge.update({
    where: { id: edgeEnd.id },
    data: { isLightingBoundary: true },
  });

  const panelInstance = await createProductInstance(design.id, {
    skuId: await skuIdByCode("SKU-PANEL-600"),
    geometryNodeId: panel.id,
    quantity: 1,
  });
  const backSheetInstance = await createProductInstance(design.id, {
    skuId: await skuIdByCode("SKU-PVC-BACK-01"),
    quantity: 1,
  });
  const connectorInstance = await createProductInstance(design.id, {
    skuId: await skuIdByCode("SKU-CONNECTOR-H"),
    quantity: 2,
  });
  const trimInstance = await createProductInstance(design.id, {
    skuId: await skuIdByCode("SKU-TRIM-EDGE-01"),
    quantity: 1,
  });
  const coveLightInstance = await createProductInstance(design.id, {
    skuId: await skuIdByCode("SKU-COVE-LIGHT-LED"),
    z: 1800,
    quantity: 1,
  });
  const furnitureInstance = await createProductInstance(design.id, {
    skuId: await skuIdByCode("SKU-FURN-VANITY-01"),
    x: 100,
    y: 100,
    quantity: 1,
  });

  const relTrim = await createGeometryProductRelationship(design.id, {
    geometryEdgeId: edgeStart.id,
    productInstanceId: trimInstance.id,
    relationshipType: "HAS_TREATMENT",
  });
  const relConnector = await createGeometryProductRelationship(design.id, {
    geometryEdgeId: edgeStart.id,
    productInstanceId: connectorInstance.id,
    relationshipType: "TERMINATES",
  });
  const relLighting = await createGeometryProductRelationship(design.id, {
    geometryEdgeId: edgeEnd.id,
    productInstanceId: coveLightInstance.id,
    relationshipType: "SUPPORTS",
  });
  const relStructural = await createGeometryProductRelationship(design.id, {
    geometryNodeId: panel.id,
    productInstanceId: backSheetInstance.id,
    relationshipType: "BOUNDARY_OF",
  });

  const edgeToBackSheet = await createProductInstanceEdge(design.id, {
    fromInstanceId: panelInstance.id,
    toInstanceId: backSheetInstance.id,
    edgeType: "REQUIRES",
    sourceSkuEdgeId: await skuEdgeId("SKU-PANEL-600", "SKU-PVC-BACK-01", "REQUIRES"),
  });
  const edgeToConnector = await createProductInstanceEdge(design.id, {
    fromInstanceId: panelInstance.id,
    toInstanceId: connectorInstance.id,
    edgeType: "REQUIRES",
    sourceSkuEdgeId: await skuEdgeId("SKU-PANEL-600", "SKU-CONNECTOR-H", "REQUIRES"),
  });

  return {
    design,
    wall,
    zone,
    partition,
    panel,
    edgeStart,
    edgeEnd,
    instances: {
      panelInstance,
      backSheetInstance,
      connectorInstance,
      trimInstance,
      coveLightInstance,
      furnitureInstance,
    },
    relationships: { relTrim, relConnector, relLighting, relStructural },
    productInstanceEdges: { edgeToBackSheet, edgeToConnector },
  };
}

export async function deleteFixtureDesign(designId: string) {
  await prisma.design.delete({ where: { id: designId } });
}
