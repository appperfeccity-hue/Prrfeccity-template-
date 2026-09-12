import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { reviseTemplate } from "@/lib/graph/revise";
import { publishTemplate } from "@/lib/graph/publish";
import { generateMasterBom } from "@/lib/graph/bom";
import { runAndPersistValidation } from "@/lib/graph/validation";
import { createWallSegment, addWallSegment, createZone, createPartition, createPanel, autoFillPartition } from "@/lib/graph/geometry";
import { createProductInstance, createGeometryProductRelationship, createProductInstanceEdge } from "@/lib/graph/product";
import { createFixture } from "@/lib/graph/fixture";
import { buildValidTemplateFixture, deleteFixtureDesign, snapshotSemanticState } from "./helpers";

let designIdsToCleanUp: string[] = [];

afterEach(async () => {
  for (const id of designIdsToCleanUp) {
    await deleteFixtureDesign(id).catch(() => {});
  }
  designIdsToCleanUp = [];
});

describe("reviseTemplate", () => {
  it("deep-copies the graph into a new DRAFT version with correct lineage", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdsToCleanUp.push(fixture.design.id);
    await runAndPersistValidation(fixture.design.id);
    await generateMasterBom(fixture.design.id);
    const published = await publishTemplate(fixture.design.id);

    const revised = await reviseTemplate(published.id);
    designIdsToCleanUp.push(revised.id);

    expect(revised.status).toBe("DRAFT");
    expect(revised.version).toBe(published.version + 1);
    expect(revised.parentTemplateId).toBe(published.id);
    expect(revised.rootTemplateId).toBe(published.id);

    const revisedPanels = await prisma.panel.findMany({ where: { designId: revised.id } });
    expect(revisedPanels).toHaveLength(1);
    expect(revisedPanels[0].widthMm).toBe(fixture.panel.widthMm);

    const revisedInstances = await prisma.productInstance.findMany({ where: { designId: revised.id } });
    expect(revisedInstances).toHaveLength(6);
  });

  it("preserves isOffcut/offcutReusable on copied Panel rows (regression)", async () => {
    // A published template with a sub-minimum offcut panel (from auto-fill) must
    // carry that offcut flag into a revised draft -- otherwise the copy is
    // silently treated as a normal panel, which would wrongly demand structural
    // support and lose the PANEL_OFFCUT_WASTE warning on the new version.
    const design = await prisma.design.create({ data: { name: "Revise Offcut Fixture" } });
    designIdsToCleanUp.push(design.id);
    const { segment } = await createWallSegment(design.id, { lengthMm: 650, heightMm: 2400 });
    const { zone } = await createZone(design.id, {
      wallSegmentId: segment.id,
      associatesWith: "WALL",
      orderIndex: 0,
      widthMm: 650,
      heightMm: 2400,
      hasCoveLighting: false,
    });
    const partition = await createPartition(design.id, zone.id, { orderIndex: 0, widthMm: 650, heightMm: 2400 });
    const panelSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PANEL-600" } });
    const backSheetSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PVC-BACK-01" } });
    const connectorSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-CONNECTOR-H" } });

    const fill = await autoFillPartition(design.id, partition.id, panelSku.id);
    expect(fill.fill.offcutReusable).toBe(false);
    const mainPanelInstance = fill.panels[0].productInstance!;

    const backSheetInstance = await createProductInstance(design.id, { skuId: backSheetSku.id, quantity: 1 });
    await createGeometryProductRelationship(design.id, {
      geometryNodeId: fill.panels[0].panel.id,
      productInstanceId: backSheetInstance.id,
      relationshipType: "BOUNDARY_OF",
    });
    const connectorInstance = await createProductInstance(design.id, { skuId: connectorSku.id, quantity: 1 });
    await createProductInstanceEdge(design.id, {
      fromInstanceId: mainPanelInstance.id,
      toInstanceId: backSheetInstance.id,
      edgeType: "REQUIRES",
    });
    await createProductInstanceEdge(design.id, {
      fromInstanceId: mainPanelInstance.id,
      toInstanceId: connectorInstance.id,
      edgeType: "REQUIRES",
    });

    const { passed } = await runAndPersistValidation(design.id);
    expect(passed).toBe(true);
    await generateMasterBom(design.id);
    const published = await publishTemplate(design.id);

    const revised = await reviseTemplate(published.id);
    designIdsToCleanUp.push(revised.id);

    const revisedPanels = await prisma.panel.findMany({ where: { designId: revised.id } });
    const revisedOffcut = revisedPanels.find((p) => p.isOffcut);
    expect(revisedOffcut).toBeDefined();
    expect(revisedOffcut!.offcutReusable).toBe(false);

    // And validation on the revised draft should still treat it as an offcut,
    // not demand structural support for it.
    const revisedIssues = (await runAndPersistValidation(revised.id)).issues;
    expect(revisedIssues.some((i) => i.code === "STRUCTURAL_SUPPORT" && i.refId === revisedOffcut!.id)).toBe(false);
    expect(revisedIssues.some((i) => i.code === "PANEL_OFFCUT_WASTE" && i.refId === revisedOffcut!.id)).toBe(true);
  });

  it("preserves quantityRule on copied GeometryProductRelationship rows (regression)", async () => {
    // A quantityRule override lost during revise would silently make the
    // revised draft's BOM fall back to productInstance.quantity instead of
    // the intended computed quantity.
    const fixture = await buildValidTemplateFixture();
    designIdsToCleanUp.push(fixture.design.id);
    await prisma.geometryProductRelationship.update({
      where: { id: fixture.relationships.relStructural.id },
      data: { quantityRule: { type: "FIXED", value: 7 } },
    });
    await runAndPersistValidation(fixture.design.id);
    await generateMasterBom(fixture.design.id);
    const published = await publishTemplate(fixture.design.id);

    const revised = await reviseTemplate(published.id);
    designIdsToCleanUp.push(revised.id);

    const revisedRel = await prisma.geometryProductRelationship.findFirst({
      where: { designId: revised.id, relationshipType: "BOUNDARY_OF" },
    });
    expect(revisedRel?.quantityRule).toEqual({ type: "FIXED", value: 7 });

    await runAndPersistValidation(revised.id);
    const revisedBom = await generateMasterBom(revised.id);
    const revisedLine = revisedBom.lines.find((l) => l.sourceGeometryProductRelationshipId === revisedRel!.id);
    expect(revisedLine?.quantity).toBe(7);
  });

  it("preserves the complete semantic state across a revision (domain-preserving clone invariant)", async () => {
    // A stronger, whole-class guard on top of the two targeted regressions above:
    // rather than asserting specific fields survive, this snapshots EVERY domain
    // field revise.ts is responsible for copying (see snapshotSemanticState) and
    // asserts the revised draft's normalized state is deeply equal to the
    // published template's -- so any future field revise.ts forgets to copy
    // fails this test too, not just the two fields this bug report happened to
    // name. The fixture deliberately exercises every branch: two zones with a
    // spatial relationship, an auto-filled partition with a sub-minimum offcut,
    // a manually-built second panel, freestanding + geometry-attached
    // instances, product-instance-edges sourced from a catalog SkuEdge, a
    // GeometryProductRelationship with a quantityRule, and a TemplateParameter
    // with a ConsultantPermission.
    const design = await prisma.design.create({ data: { name: "Revise Semantic Invariant Fixture" } });
    designIdsToCleanUp.push(design.id);

    const { segment: segment0 } = await createWallSegment(design.id, { lengthMm: 2000, heightMm: 2400 });
    // A second segment + junction -- exercises the WallJunction copy loop in
    // revise.ts (the ripple-effect fix this pass added), plus proves
    // snapshotSemanticState's segment-disambiguated zoneKey actually
    // distinguishes a zone0's orderIndex:0 from zone2's own orderIndex:0.
    const { segment: segment2 } = await addWallSegment(design.id, { lengthMm: 800, heightMm: 2400, angleDeg: 90 });
    const { zone: zone0, edges: zone0Edges } = await createZone(design.id, {
      wallSegmentId: segment0.id,
      associatesWith: "WALL",
      orderIndex: 0,
      widthMm: 650,
      heightMm: 2400,
      hasCoveLighting: false,
    });
    const { zone: zone1, edges: zone1Edges } = await createZone(design.id, {
      wallSegmentId: segment0.id,
      associatesWith: "WALL",
      orderIndex: 1,
      widthMm: 1000,
      heightMm: 2400,
      hasCoveLighting: false,
    });
    const { zone: zone2 } = await createZone(design.id, {
      wallSegmentId: segment2.id,
      associatesWith: "WALL",
      orderIndex: 0,
      widthMm: 800,
      heightMm: 2400,
      hasCoveLighting: false,
    });
    const zone0Edge = zone0Edges.find((e) => e.edgeRole === "OUTER_BOUNDARY")!;
    const zone1Edge = zone1Edges.find((e) => e.edgeRole === "OUTER_BOUNDARY")!;
    await prisma.geometryEdgeRelationship.create({
      data: { designId: design.id, edgeAId: zone0Edge.id, edgeBId: zone1Edge.id, relationshipType: "MEETS" },
    });

    const panelSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PANEL-600" } });
    const backSheetSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PVC-BACK-01" } });
    const connectorSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-CONNECTOR-H" } });
    const furnitureSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-VANITY-01" } });
    const furnitureDesignOption = await prisma.furnitureDesignOption.findFirstOrThrow({
      where: { skuId: furnitureSku.id, key: "MODERN" },
    });
    const furnitureColourOption = await prisma.furnitureColourOption.findFirstOrThrow({
      where: { skuId: furnitureSku.id, key: "WALNUT" },
    });
    const furnitureSizeOption = await prisma.furnitureSizeOption.findFirstOrThrow({
      where: { skuId: furnitureSku.id, key: "LARGE" },
    });

    const partition0 = await createPartition(design.id, zone0.id, { orderIndex: 0, widthMm: 650, heightMm: 2400 });
    const fill = await autoFillPartition(design.id, partition0.id, panelSku.id);
    expect(fill.fill.offcutReusable).toBe(false); // sanity: this fixture really exercises the offcut path
    const panel0Instance = fill.panels[0].productInstance!;

    const partition1 = await createPartition(design.id, zone1.id, { orderIndex: 0, widthMm: 1000, heightMm: 2400 });
    const { panel: panel1 } = await createPanel(design.id, partition1.id, {
      orderIndex: 0,
      widthMm: 1000,
      heightMm: 2400,
      orientation: "HORIZONTAL",
    });
    const panel1Instance = await createProductInstance(design.id, { skuId: panelSku.id, geometryNodeId: panel1.id, quantity: 1 });

    const partition2 = await createPartition(design.id, zone2.id, { orderIndex: 0, widthMm: 800, heightMm: 2400 });
    const { panel: panel2 } = await createPanel(design.id, partition2.id, {
      orderIndex: 0,
      widthMm: 800,
      heightMm: 2400,
      orientation: "VERTICAL",
    });
    const panel2Instance = await createProductInstance(design.id, { skuId: panelSku.id, geometryNodeId: panel2.id, quantity: 1 });

    const backSheetInstance = await createProductInstance(design.id, {
      skuId: backSheetSku.id,
      wallSegmentId: segment0.id,
      quantity: 1,
    });
    const connectorInstance = await createProductInstance(design.id, {
      skuId: connectorSku.id,
      wallSegmentId: segment0.id,
      quantity: 1,
    });
    await createProductInstance(design.id, {
      skuId: furnitureSku.id,
      wallSegmentId: segment0.id,
      x: 150,
      y: 200,
      quantity: 1,
      designOptionId: furnitureDesignOption.id,
      colourOptionId: furnitureColourOption.id,
      sizeOptionId: furnitureSizeOption.id,
    });

    await createGeometryProductRelationship(design.id, {
      geometryNodeId: fill.panels[0].panel.id,
      productInstanceId: backSheetInstance.id,
      relationshipType: "BOUNDARY_OF",
      quantityRule: { type: "FIXED", value: 3 },
    });
    await createGeometryProductRelationship(design.id, {
      geometryNodeId: panel1.id,
      productInstanceId: backSheetInstance.id,
      relationshipType: "BOUNDARY_OF",
    });
    await createGeometryProductRelationship(design.id, {
      geometryNodeId: panel2.id,
      productInstanceId: backSheetInstance.id,
      relationshipType: "BOUNDARY_OF",
    });

    await createProductInstanceEdge(design.id, {
      fromInstanceId: panel0Instance.id,
      toInstanceId: backSheetInstance.id,
      edgeType: "REQUIRES",
      origin: "CATALOG_DERIVED",
    });
    await createProductInstanceEdge(design.id, { fromInstanceId: panel0Instance.id, toInstanceId: connectorInstance.id, edgeType: "REQUIRES" });
    await createProductInstanceEdge(design.id, { fromInstanceId: panel1Instance.id, toInstanceId: backSheetInstance.id, edgeType: "REQUIRES" });
    await createProductInstanceEdge(design.id, { fromInstanceId: panel1Instance.id, toInstanceId: connectorInstance.id, edgeType: "REQUIRES" });
    await createProductInstanceEdge(design.id, { fromInstanceId: panel2Instance.id, toInstanceId: backSheetInstance.id, edgeType: "REQUIRES" });
    await createProductInstanceEdge(design.id, { fromInstanceId: panel2Instance.id, toInstanceId: connectorInstance.id, edgeType: "REQUIRES" });

    const param = await prisma.templateParameter.create({
      data: {
        templateId: design.id,
        targetProductInstanceId: panel1Instance.id,
        paramKey: "PANEL_WIDTH",
        paramType: "NUMERIC_RANGE",
        label: "Panel Width",
        defaultValue: "1000",
        unit: "mm",
      },
    });
    await prisma.consultantPermission.create({
      data: { templateParameterId: param.id, editableByConsultant: true, minValue: 600, maxValue: 1500 },
    });

    // Placed far from every instance's footprint so it doesn't trip
    // FIXTURE_CLEARANCE_OVERLAP and break the passed===true assertion below.
    await createFixture(design.id, {
      fixtureType: "WINDOW",
      label: "Bedroom window",
      wallSegmentId: segment0.id,
      xMm: 5000,
      yMm: 5000,
      widthMm: 900,
      heightMm: 1200,
      clearanceMm: 50,
    });

    const { passed, issues } = await runAndPersistValidation(design.id);
    if (!passed) console.error("Unexpected validation issues:", issues);
    expect(passed).toBe(true);
    await generateMasterBom(design.id);
    const published = await publishTemplate(design.id);

    const before = await snapshotSemanticState(published.id);
    const revised = await reviseTemplate(published.id);
    designIdsToCleanUp.push(revised.id);
    const after = await snapshotSemanticState(revised.id);

    expect(after).toEqual(before);
  });
});
