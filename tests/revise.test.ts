import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { reviseTemplate } from "@/lib/graph/revise";
import { publishTemplate } from "@/lib/graph/publish";
import { generateMasterBom } from "@/lib/graph/bom";
import { runAndPersistValidation } from "@/lib/graph/validation";
import { createWall, createZone, createPartition, autoFillPartition } from "@/lib/graph/geometry";
import { createProductInstance, createGeometryProductRelationship, createProductInstanceEdge } from "@/lib/graph/product";
import { buildValidTemplateFixture, deleteFixtureDesign } from "./helpers";

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
});
