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

/**
 * Builds a normalized, id-independent snapshot of a design's full domain state
 * (geometry graph + product graph + relationships + BOM-affecting fields +
 * consultant parameters), keyed by structural position (orderIndex/edgeRole/SKU
 * code) rather than raw database ids.
 *
 * Two designs with different row ids but identical semantics produce deeply
 * equal snapshots, which is what makes this useful as a revision invariant:
 * `snapshotSemanticState(revisedDraftId)` should equal
 * `snapshotSemanticState(publishedTemplateId)`. Unlike a field-by-field
 * regression test, this catches ANY field revise.ts forgets to copy across
 * the model, not just the ones a specific bug report already named -- at the
 * cost of needing its own update whenever a new domain field is added.
 *
 * Deliberately does not attempt to key ProductInstances uniquely when a
 * design places more than one freestanding instance of the same SKU (rare in
 * these fixtures) -- geometry-attached instances are keyed by their node's
 * structural position, which is always unique.
 */
export async function snapshotSemanticState(designId: string) {
  const [wall, zones, partitions, panels, edges, edgeRelationships, instances, instanceEdges, geoProductRels, params] =
    await Promise.all([
      prisma.wall.findFirst({ where: { designId } }),
      prisma.zone.findMany({ where: { designId } }),
      prisma.zonePartition.findMany({ where: { designId } }),
      prisma.panel.findMany({ where: { designId } }),
      prisma.geometryEdge.findMany({ where: { designId } }),
      prisma.geometryEdgeRelationship.findMany({ where: { designId } }),
      prisma.productInstance.findMany({ where: { designId }, include: { sku: true } }),
      prisma.productInstanceEdge.findMany({ where: { designId } }),
      prisma.geometryProductRelationship.findMany({ where: { designId } }),
      prisma.templateParameter.findMany({ where: { templateId: designId }, include: { permission: true } }),
    ]);

  const zoneKey = (zoneId: string): string | null => {
    const z = zones.find((zz) => zz.id === zoneId);
    return z ? `zone:${z.orderIndex}` : null;
  };
  const partitionKey = (partitionId: string): string | null => {
    const p = partitions.find((pp) => pp.id === partitionId);
    if (!p) return null;
    return `${zoneKey(p.zoneId)}/partition:${p.orderIndex}`;
  };
  const panelKey = (panelId: string): string | null => {
    const p = panels.find((pp) => pp.id === panelId);
    if (!p) return null;
    return `${partitionKey(p.partitionId)}/panel:${p.orderIndex}`;
  };
  const nodeKey = (nodeId: string): string => {
    if (wall && nodeId === wall.id) return "wall";
    return zoneKey(nodeId) ?? partitionKey(nodeId) ?? panelKey(nodeId) ?? "unknown-node";
  };
  const edgeKey = (edgeId: string): string => {
    const e = edges.find((ee) => ee.id === edgeId);
    if (!e) return "unknown-edge";
    const side = (e.metadata as { side?: string } | null)?.side;
    return `${nodeKey(e.nodeId)}/edge:${e.edgeRole}${side ? `:${side}` : ""}`;
  };

  const instanceKeyById = new Map<string, string>();
  for (const inst of instances) {
    instanceKeyById.set(
      inst.id,
      inst.geometryNodeId ? `${nodeKey(inst.geometryNodeId)}/sku:${inst.sku.code}` : `freestanding/sku:${inst.sku.code}`,
    );
  }

  const byKey = <T extends { key: string }>(rows: T[]) => rows.sort((a, b) => a.key.localeCompare(b.key));

  return {
    wall: wall && {
      wallType: wall.wallType,
      lengthMm: wall.lengthMm,
      heightMm: wall.heightMm,
      cornerAngleDeg: wall.cornerAngleDeg,
    },
    zones: byKey(
      zones.map((z) => ({
        key: zoneKey(z.id)!,
        associatesWith: z.associatesWith,
        orderIndex: z.orderIndex,
        widthMm: z.widthMm,
        heightMm: z.heightMm,
        hasCoveLighting: z.hasCoveLighting,
        coveLightZMm: z.coveLightZMm,
        attachedToWall: z.wallId != null,
      })),
    ),
    partitions: byKey(
      partitions.map((p) => ({
        key: partitionKey(p.id)!,
        orderIndex: p.orderIndex,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
      })),
    ),
    panels: byKey(
      panels.map((p) => ({
        key: panelKey(p.id)!,
        orderIndex: p.orderIndex,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        orientation: p.orientation,
        isOffcut: p.isOffcut,
        offcutReusable: p.offcutReusable,
      })),
    ),
    edges: byKey(
      edges.map((e) => ({
        key: edgeKey(e.id),
        edgeRole: e.edgeRole,
        requiresTermination: e.requiresTermination,
        requiresConnector: e.requiresConnector,
        requiresTrim: e.requiresTrim,
        isLightingBoundary: e.isLightingBoundary,
        metadata: e.metadata,
      })),
    ),
    edgeRelationships: edgeRelationships
      .map((r) => {
        const [first, second] = [edgeKey(r.edgeAId), edgeKey(r.edgeBId)].sort();
        return { key: `${first}<->${second}:${r.relationshipType}`, relationshipType: r.relationshipType };
      })
      .sort((a, b) => a.key.localeCompare(b.key)),
    productInstances: byKey(
      instances.map((inst) => ({
        key: instanceKeyById.get(inst.id)!,
        skuCode: inst.sku.code,
        x: inst.x,
        y: inst.y,
        z: inst.z,
        rotationDeg: inst.rotationDeg,
        quantity: inst.quantity,
      })),
    ),
    productInstanceEdges: instanceEdges
      .map((e) => ({
        fromKey: instanceKeyById.get(e.fromInstanceId)!,
        toKey: instanceKeyById.get(e.toInstanceId)!,
        edgeType: e.edgeType,
        // The referenced SkuEdge is shared, uncopied catalog data -- the same
        // row id is valid to compare literally across both designs.
        sourceSkuEdgeId: e.sourceSkuEdgeId,
        origin: e.origin,
      }))
      .sort((a, b) => `${a.fromKey}->${a.toKey}:${a.edgeType}`.localeCompare(`${b.fromKey}->${b.toKey}:${b.edgeType}`)),
    geometryProductRelationships: geoProductRels
      .map((r) => ({
        key: `${r.geometryEdgeId ? edgeKey(r.geometryEdgeId) : nodeKey(r.geometryNodeId!)}:${r.relationshipType}:${instanceKeyById.get(r.productInstanceId)}`,
        targetKind: r.geometryEdgeId ? "edge" : "node",
        instanceKey: instanceKeyById.get(r.productInstanceId)!,
        relationshipType: r.relationshipType,
        condition: r.condition,
        quantityRule: r.quantityRule,
        origin: r.origin,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    templateParameters: params
      .map((p) => ({
        targetInstanceKey: p.targetProductInstanceId ? (instanceKeyById.get(p.targetProductInstanceId) ?? null) : null,
        targetEdgeKey: p.targetGeometryEdgeId ? edgeKey(p.targetGeometryEdgeId) : null,
        paramKey: p.paramKey,
        paramType: p.paramType,
        label: p.label,
        defaultValue: p.defaultValue,
        unit: p.unit,
        permission: p.permission && {
          editableByConsultant: p.permission.editableByConsultant,
          minValue: p.permission.minValue,
          maxValue: p.permission.maxValue,
          allowedValues: p.permission.allowedValues,
        },
      }))
      .sort((a, b) => a.paramKey.localeCompare(b.paramKey)),
  };
}
