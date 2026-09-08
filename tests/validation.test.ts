import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { validateDesign, runAndPersistValidation } from "@/lib/graph/validation";
import { createWall, createZone, createPartition, autoFillPartition } from "@/lib/graph/geometry";
import { createProductInstance, createGeometryProductRelationship, createProductInstanceEdge } from "@/lib/graph/product";
import { buildValidTemplateFixture, deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
});

describe("validateDesign", () => {
  it("passes a fully-wired template with zero issues", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    const issues = await validateDesign(fixture.design.id);
    expect(issues).toEqual([]);
  });

  it("flags a missing trim/connector/termination relationship at the exact offending edge", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    // Both CONNECTION-category relationships on edgeStart must go: either one alone
    // still satisfies the category-based trim/connector checks.
    await prisma.geometryProductRelationship.delete({ where: { id: fixture.relationships.relTrim.id } });
    await prisma.geometryProductRelationship.delete({ where: { id: fixture.relationships.relConnector.id } });

    const issues = await validateDesign(fixture.design.id);
    for (const code of ["EDGE_TREATMENT_TRIM", "EDGE_TREATMENT_CONNECTOR", "EDGE_TERMINATION"]) {
      const matches = issues.filter((i) => i.code === code);
      expect(matches).toHaveLength(1);
      expect(matches[0].refId).toBe(fixture.edgeStart.id);
    }
  });

  it("flags zero zones", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    await prisma.geometryNode.delete({ where: { id: fixture.zone.id } });

    const issues = await validateDesign(fixture.design.id);
    expect(issues.some((i) => i.code === "ZONE_COUNT")).toBe(true);
  });

  it("flags a panel missing its structural-support relationship", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    await prisma.geometryProductRelationship.delete({
      where: { id: fixture.relationships.relStructural.id },
    });

    const issues = await validateDesign(fixture.design.id);
    const structuralIssues = issues.filter((i) => i.code === "STRUCTURAL_SUPPORT");
    expect(structuralIssues).toHaveLength(1);
    expect(structuralIssues[0].refId).toBe(fixture.panel.id);
  });

  it("flags a product instance edge whose sourceSkuEdge doesn't match the linked instances' SKUs", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    const wrongSourceSkuEdge = await prisma.skuEdge.findFirstOrThrow({
      where: { edgeType: "TERMINATES_WITH" },
    });
    await prisma.productInstanceEdge.update({
      where: { id: fixture.productInstanceEdges.edgeToConnector.id },
      data: { sourceSkuEdgeId: wrongSourceSkuEdge.id },
    });

    const issues = await validateDesign(fixture.design.id);
    const consistencyIssues = issues.filter((i) => i.code === "PRODUCT_EDGE_CONSISTENCY");
    expect(consistencyIssues).toHaveLength(1);
    expect(consistencyIssues[0].refId).toBe(fixture.productInstanceEdges.edgeToConnector.id);
  });

  it("flags a permission whose default value falls outside its own range", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    const param = await prisma.templateParameter.create({
      data: {
        templateId: fixture.design.id,
        paramKey: "PANEL_WIDTH",
        paramType: "NUMERIC_RANGE",
        label: "Panel Width",
        defaultValue: "600",
        unit: "mm",
      },
    });
    await prisma.consultantPermission.create({
      data: {
        templateParameterId: param.id,
        editableByConsultant: true,
        minValue: 300,
        maxValue: 500,
      },
    });

    const issues = await validateDesign(fixture.design.id);
    expect(issues.some((i) => i.code === "PARAMETER_PERMISSION_RANGE_SANITY")).toBe(true);
  });

  it("flags a sub-minimum offcut with a WARNING that does not block passing validation", async () => {
    // A 650mm partition + SKU-PANEL-600 (600mm, minCutPieceMm 100) yields a single
    // panel with a 50mm offcut -- below the minimum, and rawCount is already 1 so
    // the algorithm can't reduce further. PANEL_OFFCUT_WASTE should fire as a
    // WARNING, and the design should otherwise still pass.
    const design = await prisma.design.create({ data: { name: "Offcut Waste Fixture" } });
    const { wall } = await createWall(design.id, { wallType: "STRAIGHT_LTR", lengthMm: 650, heightMm: 2400 });
    const { zone } = await createZone(design.id, {
      wallId: wall.id,
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
    const mainPanel = fill.panels[0].panel;
    const mainPanelInstance = fill.panels[0].productInstance!;

    const backSheetInstance = await createProductInstance(design.id, { skuId: backSheetSku.id, quantity: 1 });
    await createGeometryProductRelationship(design.id, {
      geometryNodeId: mainPanel.id,
      productInstanceId: backSheetInstance.id,
      relationshipType: "BOUNDARY_OF",
    });
    // SKU-PANEL-600 REQUIRES both PVC-BACK-01 and CONNECTOR-H per seed data --
    // satisfy both so REQUIRED_SKU_EDGES_SATISFIED doesn't also fire an ERROR here.
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

    const { passed, issues } = await runAndPersistValidation(design.id);
    const wasteIssues = issues.filter((i) => i.code === "PANEL_OFFCUT_WASTE");
    expect(wasteIssues).toHaveLength(1);
    expect(wasteIssues[0].severity).toBe("WARNING");
    expect(passed).toBe(true);

    await deleteFixtureDesign(design.id);
  });

  it("ZONE_ADJACENCY_INTEGRITY accepts spatial relationship types and rejects non-spatial ones", async () => {
    const design = await prisma.design.create({ data: { name: "Zone Relationship Fixture" } });
    const { wall } = await createWall(design.id, { wallType: "STRAIGHT_LTR", lengthMm: 2000, heightMm: 2400 });
    const { edges: edgesA } = await createZone(design.id, {
      wallId: wall.id,
      associatesWith: "WALL",
      orderIndex: 0,
      widthMm: 1000,
      heightMm: 2400,
      hasCoveLighting: false,
    });
    const { edges: edgesB } = await createZone(design.id, {
      wallId: wall.id,
      associatesWith: "WALL",
      orderIndex: 1,
      widthMm: 1000,
      heightMm: 2400,
      hasCoveLighting: false,
    });
    const edgeA = edgesA.find((e) => e.edgeRole === "OUTER_BOUNDARY")!;
    const edgeB = edgesB.find((e) => e.edgeRole === "OUTER_BOUNDARY")!;

    for (const relationshipType of ["CONTINUES_TO", "TERMINATES_AT"] as const) {
      const rel = await prisma.geometryEdgeRelationship.create({
        data: { designId: design.id, edgeAId: edgeA.id, edgeBId: edgeB.id, relationshipType },
      });
      const issues = await validateDesign(design.id);
      expect(issues.some((i) => i.code === "ZONE_ADJACENCY_INTEGRITY")).toBe(true);
      await prisma.geometryEdgeRelationship.delete({ where: { id: rel.id } });
    }

    for (const relationshipType of ["ADJACENT_TO", "MEETS", "SHARES_BOUNDARY"] as const) {
      const rel = await prisma.geometryEdgeRelationship.create({
        data: { designId: design.id, edgeAId: edgeA.id, edgeBId: edgeB.id, relationshipType },
      });
      const issues = await validateDesign(design.id);
      expect(issues.some((i) => i.code === "ZONE_ADJACENCY_INTEGRITY")).toBe(false);
      await prisma.geometryEdgeRelationship.delete({ where: { id: rel.id } });
    }

    await deleteFixtureDesign(design.id);
  });

  it("STRUCTURAL_SUPPORT skips offcut panels", async () => {
    const design = await prisma.design.create({ data: { name: "Offcut Structural Skip Fixture" } });
    const { wall } = await createWall(design.id, { wallType: "STRAIGHT_LTR", lengthMm: 650, heightMm: 2400 });
    const { zone } = await createZone(design.id, {
      wallId: wall.id,
      associatesWith: "WALL",
      orderIndex: 0,
      widthMm: 650,
      heightMm: 2400,
      hasCoveLighting: false,
    });
    const partition = await createPartition(design.id, zone.id, { orderIndex: 0, widthMm: 650, heightMm: 2400 });
    const panelSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PANEL-600" } });

    await autoFillPartition(design.id, partition.id, panelSku.id);
    // The offcut is a separate Panel row (isOffcut: true); fetch it directly to confirm
    // it's excluded from the structural-support check.
    const allPanels = await prisma.panel.findMany({ where: { partitionId: partition.id } });
    const offcut = allPanels.find((p) => p.isOffcut);
    expect(offcut).toBeDefined();

    const issues = await validateDesign(design.id);
    const structuralIssues = issues.filter((i) => i.code === "STRUCTURAL_SUPPORT");
    // Only the main (non-offcut) panel should be flagged for missing structural support.
    expect(structuralIssues.some((i) => i.refId === offcut!.id)).toBe(false);

    await deleteFixtureDesign(design.id);
  });
});
