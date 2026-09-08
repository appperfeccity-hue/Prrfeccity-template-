import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { validateDesign } from "@/lib/graph/validation";
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
      where: { edgeType: "TERMINATES" },
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
});
