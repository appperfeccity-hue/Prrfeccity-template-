import { prisma } from "@/lib/prisma";
import { createWallSegment, createZone, createPartition, createPanel } from "@/lib/graph/geometry";
import {
  createProductInstance,
  createGeometryProductRelationship,
  createProductInstanceEdge,
} from "@/lib/graph/product";
import { runAndPersistValidation } from "@/lib/graph/validation";
import { generateMasterBom } from "@/lib/graph/bom";
import { publishTemplate } from "@/lib/graph/publish";
import { createProjectFromTemplate } from "@/lib/graph/project";
import { ENUM_SELECTION_PARAM_KEYS } from "@/lib/graph/constants";
import type { ParameterType } from "@/generated/prisma/client";

async function skuIdByCode(code: string) {
  const sku = await prisma.skuMaster.findUniqueOrThrow({ where: { code } });
  return sku.id;
}

async function furnitureDesignOptionId(skuCode: string, key: string) {
  const skuId = await skuIdByCode(skuCode);
  const row = await prisma.furnitureDesignOption.findFirstOrThrow({ where: { skuId, key } });
  return row.id;
}

async function furnitureColourOptionId(skuCode: string, key: string) {
  const skuId = await skuIdByCode(skuCode);
  const row = await prisma.furnitureColourOption.findFirstOrThrow({ where: { skuId, key } });
  return row.id;
}

async function furnitureSizeOptionId(skuCode: string, key: string) {
  const skuId = await skuIdByCode(skuCode);
  const row = await prisma.furnitureSizeOption.findFirstOrThrow({ where: { skuId, key } });
  return row.id;
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

  const { segment } = await createWallSegment(design.id, {
    lengthMm: 1200,
    heightMm: 2400,
  });

  const { zone } = await createZone(design.id, {
    wallSegmentId: segment.id,
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
    designOptionId: await furnitureDesignOptionId("SKU-FURN-VANITY-01", "CLASSIC"),
    colourOptionId: await furnitureColourOptionId("SKU-FURN-VANITY-01", "WHITE"),
    sizeOptionId: await furnitureSizeOptionId("SKU-FURN-VANITY-01", "SMALL"),
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
    segment,
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

async function createParam(
  templateId: string,
  input: {
    targetProductInstanceId?: string;
    targetGeometryEdgeId?: string;
    paramKey: string;
    paramType: ParameterType;
    defaultValue: string;
    permission: { editableByConsultant: boolean; minValue?: number; maxValue?: number; allowedValues?: string[] };
  },
) {
  const param = await prisma.templateParameter.create({
    data: {
      templateId,
      targetProductInstanceId: input.targetProductInstanceId ?? null,
      targetGeometryEdgeId: input.targetGeometryEdgeId ?? null,
      paramKey: input.paramKey,
      paramType: input.paramType,
      label: input.paramKey,
      defaultValue: input.defaultValue,
    },
  });
  await prisma.consultantPermission.create({
    data: {
      templateParameterId: param.id,
      editableByConsultant: input.permission.editableByConsultant,
      minValue: input.permission.minValue,
      maxValue: input.permission.maxValue,
      allowedValues: input.permission.allowedValues ?? [],
    },
  });
  return param;
}

/**
 * Builds a small, published Template wired with one TemplateParameter +
 * ConsultantPermission per paramType (all six), publishes it, then creates a
 * Project from it -- the shared fixture for tests/project-permissions.test.ts
 * and tests/final-bom.test.ts. `furnitureSkuCode` defaults to the rotatable
 * SKU-FURN-VANITY-01; pass "SKU-FURN-STOOL-01" (seeded non-rotatable) to
 * build a fixture for the "rotation blocked regardless of permission" case.
 * `createdByUserId` must reference a real User row (createProjectFromTemplate
 * enforces the FK) -- callers create/clean up that User themselves, matching
 * the existing tests/auth.test.ts convention.
 */
export async function buildPublishedProjectTemplateFixture(
  createdByUserId: string,
  opts: { furnitureSkuCode?: string } = {},
) {
  const furnitureSkuCode = opts.furnitureSkuCode ?? "SKU-FURN-VANITY-01";
  const isVanity = furnitureSkuCode === "SKU-FURN-VANITY-01";
  const designKey = isVanity ? "CLASSIC" : "ROUND";
  const colourKey = isVanity ? "WHITE" : "BLACK";
  const sizeKey = isVanity ? "SMALL" : "STANDARD";

  const design = await prisma.design.create({ data: { name: "Project Fixture Template" } });

  const { segment } = await createWallSegment(design.id, {
    lengthMm: 1200,
    heightMm: 2400,
  });
  const { zone } = await createZone(design.id, {
    wallSegmentId: segment.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 1200,
    heightMm: 2400,
    hasCoveLighting: false,
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
  await prisma.geometryEdge.update({ where: { id: edgeStart.id }, data: { requiresTrim: true } });
  await prisma.geometryEdge.update({ where: { id: edgeEnd.id }, data: { requiresConnector: true } });

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
    quantity: 1,
  });
  const trimInstance = await createProductInstance(design.id, {
    skuId: await skuIdByCode("SKU-TRIM-EDGE-01"),
    quantity: 1,
  });
  const furnitureInstance = await createProductInstance(design.id, {
    skuId: await skuIdByCode(furnitureSkuCode),
    x: 100,
    y: 100,
    z: 0,
    quantity: 1,
    designOptionId: await furnitureDesignOptionId(furnitureSkuCode, designKey),
    colourOptionId: await furnitureColourOptionId(furnitureSkuCode, colourKey),
    sizeOptionId: await furnitureSizeOptionId(furnitureSkuCode, sizeKey),
  });

  const relTrim = await createGeometryProductRelationship(design.id, {
    geometryEdgeId: edgeStart.id,
    productInstanceId: trimInstance.id,
    relationshipType: "HAS_TREATMENT",
  });
  const relStructural = await createGeometryProductRelationship(design.id, {
    geometryNodeId: panel.id,
    productInstanceId: backSheetInstance.id,
    relationshipType: "BOUNDARY_OF",
  });
  // edgeEnd deliberately has no EDGE_TREATMENT TemplateParameter wired to
  // it -- exercises the "no permission exists at all" 403 case for
  // setProjectEdgeTreatment, distinct from edgeStart's fully-wired case.
  const relConnectorAtEnd = await createGeometryProductRelationship(design.id, {
    geometryEdgeId: edgeEnd.id,
    productInstanceId: connectorInstance.id,
    relationshipType: "TERMINATES",
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

  const quantityParam = await createParam(design.id, {
    targetProductInstanceId: furnitureInstance.id,
    paramKey: "QUANTITY",
    paramType: "QUANTITY",
    defaultValue: "1",
    permission: { editableByConsultant: true, minValue: 1, maxValue: 5 },
  });
  const numericRangeParam = await createParam(design.id, {
    targetProductInstanceId: furnitureInstance.id,
    paramKey: "ROTATION_DEG",
    paramType: "NUMERIC_RANGE",
    defaultValue: "0",
    permission: { editableByConsultant: true, minValue: 0, maxValue: 360 },
  });
  const positionParam = await createParam(design.id, {
    targetProductInstanceId: furnitureInstance.id,
    paramKey: "POSITION",
    paramType: "POSITION",
    defaultValue: "0",
    permission: { editableByConsultant: true, minValue: 0, maxValue: 1000 },
  });
  const skuSubstitutionParam = await createParam(design.id, {
    targetProductInstanceId: connectorInstance.id,
    paramKey: "SKU_SUBSTITUTION",
    paramType: "SKU_SUBSTITUTION",
    defaultValue: "SKU-CONNECTOR-H",
    permission: { editableByConsultant: true, allowedValues: ["SKU-TRIM-EDGE-01"] },
  });
  const enumSelectionParam = await createParam(design.id, {
    targetProductInstanceId: furnitureInstance.id,
    paramKey: ENUM_SELECTION_PARAM_KEYS.COLOUR_OPTION,
    paramType: "ENUM_SELECTION",
    defaultValue: colourKey,
    permission: { editableByConsultant: true, allowedValues: [colourKey] },
  });
  const edgeTreatmentParam = await createParam(design.id, {
    targetGeometryEdgeId: edgeStart.id,
    paramKey: "EDGE_TREATMENT",
    paramType: "EDGE_TREATMENT",
    defaultValue: "SKU-TRIM-EDGE-01",
    permission: { editableByConsultant: true, allowedValues: ["SKU-TRIM-EDGE-01", "SKU-CONNECTOR-H"] },
  });

  await runAndPersistValidation(design.id);
  const masterBom = await generateMasterBom(design.id);
  await publishTemplate(design.id);

  const project = await createProjectFromTemplate(design.id, "Fixture Project", createdByUserId);

  const projectInstanceBySourceId = new Map(project.productInstances.map((pi) => [pi.sourceProductInstanceId, pi]));

  return {
    design,
    edgeStart,
    edgeEnd,
    panel,
    instances: { panelInstance, backSheetInstance, connectorInstance, trimInstance, furnitureInstance },
    relationships: { relTrim, relStructural, relConnectorAtEnd },
    productInstanceEdges: { edgeToBackSheet, edgeToConnector },
    params: {
      quantityParam,
      numericRangeParam,
      positionParam,
      skuSubstitutionParam,
      enumSelectionParam,
      edgeTreatmentParam,
    },
    masterBomSnapshot: { id: masterBom.id, version: masterBom.version, lineCount: masterBom.lines.length },
    project,
    projectFurnitureInstance: projectInstanceBySourceId.get(furnitureInstance.id)!,
    projectConnectorInstance: projectInstanceBySourceId.get(connectorInstance.id)!,
    projectTrimInstance: projectInstanceBySourceId.get(trimInstance.id)!,
    projectBackSheetInstance: projectInstanceBySourceId.get(backSheetInstance.id)!,
    projectPanelInstance: projectInstanceBySourceId.get(panelInstance.id)!,
  };
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
  const [segments, junctions, zones, partitions, panels, edges, edgeRelationships, instances, instanceEdges, geoProductRels, params, fixtures, constraints, primitiveLines] =
    await Promise.all([
      prisma.wallSegment.findMany({ where: { designId }, orderBy: { sequence: "asc" } }),
      prisma.wallJunction.findMany({ where: { designId } }),
      prisma.zone.findMany({ where: { designId } }),
      prisma.zonePartition.findMany({ where: { designId } }),
      prisma.panel.findMany({ where: { designId } }),
      prisma.geometryEdge.findMany({ where: { designId } }),
      prisma.geometryEdgeRelationship.findMany({ where: { designId } }),
      prisma.productInstance.findMany({
        where: { designId },
        include: { sku: true, designOption: true, colourOption: true, sizeOption: true },
      }),
      prisma.productInstanceEdge.findMany({ where: { designId } }),
      prisma.geometryProductRelationship.findMany({ where: { designId } }),
      prisma.templateParameter.findMany({ where: { templateId: designId }, include: { permission: true } }),
      prisma.fixture.findMany({ where: { designId } }),
      prisma.constraint.findMany({ where: { designId } }),
      prisma.geometryPrimitiveLine.findMany({ where: { designId } }),
    ]);

  const segmentSequence = (segmentId: string | null): number | null => {
    const s = segments.find((ss) => ss.id === segmentId);
    return s ? s.sequence : null;
  };
  // Segment-disambiguated -- two segments each holding a zone with
  // orderIndex:0 must not collide into the same key, or a dropped
  // WallSegment/wallSegmentId on revise would silently pass this invariant.
  const zoneKey = (zoneId: string): string | null => {
    const z = zones.find((zz) => zz.id === zoneId);
    if (!z) return null;
    return `segment:${segmentSequence(z.wallSegmentId)}/zone:${z.orderIndex}`;
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
    const segment = segments.find((s) => s.id === nodeId);
    if (segment) return `segment:${segment.sequence}`;
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

  // Fixture rows have no natural structural key the way geometry-attached
  // instances do -- a value-based key is the honest choice here. Built as an
  // id-lookup map (rather than computed inline where used) because
  // Constraint endpoints need to resolve a fixture's key by id, same as
  // instanceKeyById already does for ProductInstance.
  const fixtureKeyById = new Map<string, string>();
  for (const fx of fixtures) {
    fixtureKeyById.set(fx.id, `fixture:${fx.fixtureType}:${fx.xMm},${fx.yMm}`);
  }

  // Resolves a Constraint endpoint (kind + one of its 4 id columns) to the
  // same structural/value key its own entity type already uses elsewhere in
  // this snapshot -- keeps a Constraint's identity independent of raw ids
  // across parent/child Template revisions, exactly like every other
  // relationship in this snapshot.
  const endpointKey = (
    kind: string | null,
    fixtureId: string | null,
    productInstanceId: string | null,
    geometryNodeId: string | null,
    geometryEdgeId: string | null,
  ): string | null => {
    if (kind === "FIXTURE") return fixtureId ? (fixtureKeyById.get(fixtureId) ?? null) : null;
    if (kind === "PRODUCT_INSTANCE") return productInstanceId ? (instanceKeyById.get(productInstanceId) ?? null) : null;
    if (kind === "GEOMETRY_NODE") return geometryNodeId ? nodeKey(geometryNodeId) : null;
    if (kind === "GEOMETRY_EDGE") return geometryEdgeId ? edgeKey(geometryEdgeId) : null;
    return null;
  };

  const byKey = <T extends { key: string }>(rows: T[]) => rows.sort((a, b) => a.key.localeCompare(b.key));

  return {
    wallSegments: [...segments]
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({ sequence: s.sequence, lengthMm: s.lengthMm, heightMm: s.heightMm })),
    wallJunctions: byKey(
      junctions.map((j) => ({
        key: `${segmentSequence(j.segmentAId)}<->${segmentSequence(j.segmentBId)}`,
        angleDeg: j.angleDeg,
      })),
    ),
    zones: byKey(
      zones.map((z) => ({
        key: zoneKey(z.id)!,
        associatesWith: z.associatesWith,
        orderIndex: z.orderIndex,
        widthMm: z.widthMm,
        heightMm: z.heightMm,
        hasCoveLighting: z.hasCoveLighting,
        coveLightZMm: z.coveLightZMm,
        attachedToWall: z.wallSegmentId != null,
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
        designOptionKey: inst.designOption?.key ?? null,
        colourOptionKey: inst.colourOption?.key ?? null,
        sizeOptionKey: inst.sizeOption?.key ?? null,
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
    fixtures: fixtures
      .map((fx) => ({
        key: fixtureKeyById.get(fx.id)!,
        fixtureType: fx.fixtureType,
        label: fx.label,
        xMm: fx.xMm,
        yMm: fx.yMm,
        widthMm: fx.widthMm,
        heightMm: fx.heightMm,
        clearanceMm: fx.clearanceMm,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    constraints: constraints
      .map((c) => {
        const aKey = endpointKey(
          c.targetAKind,
          c.targetAFixtureId,
          c.targetAProductInstanceId,
          c.targetAGeometryNodeId,
          c.targetAGeometryEdgeId,
        );
        const bKey = c.targetBKind
          ? endpointKey(
              c.targetBKind,
              c.targetBFixtureId,
              c.targetBProductInstanceId,
              c.targetBGeometryNodeId,
              c.targetBGeometryEdgeId,
            )
          : null;
        return {
          key: `${c.constraintType}:${c.axis}:${aKey}<->${bKey}:${c.valueMm}:${c.minValueMm}:${c.maxValueMm}`,
          constraintType: c.constraintType,
          axis: c.axis,
          targetAKey: aKey,
          targetBKey: bKey,
          valueMm: c.valueMm,
          minValueMm: c.minValueMm,
          maxValueMm: c.maxValueMm,
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key)),
    // Phase 6 item 1: Generalized Geometry System -- value-based key (a
    // primitive has no natural structural key, same reasoning as Fixture's
    // own key above), exercises the new revise.ts LINE copy loop.
    primitives: primitiveLines
      .map((line) => ({
        key: `primitive:LINE:${line.startXMm},${line.startYMm}-${line.endXMm},${line.endYMm}`,
        startXMm: line.startXMm,
        startYMm: line.startYMm,
        endXMm: line.endXMm,
        endYMm: line.endYMm,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}
