import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateMasterBom } from "@/lib/graph/bom";
import { runAndPersistValidation } from "@/lib/graph/validation";
import { buildValidTemplateFixture, deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
});

describe("generateMasterBom", () => {
  it("refuses to generate without a passing validation result", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    await expect(generateMasterBom(fixture.design.id)).rejects.toThrow(/validation/i);
  });

  it("produces one line per provenance source, each with exactly one source FK", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    const { passed } = await runAndPersistValidation(fixture.design.id);
    expect(passed).toBe(true);

    const bom = await generateMasterBom(fixture.design.id);
    expect(bom.lines).toHaveLength(7);

    for (const line of bom.lines) {
      const sourceCount = [
        line.sourceGeometryProductRelationshipId,
        line.sourceProductInstanceEdgeId,
        line.sourceProductInstanceId,
      ].filter((v) => v != null).length;
      expect(sourceCount).toBe(1);
    }

    const byRelationship = (relId: string) =>
      bom.lines.find((l) => l.sourceGeometryProductRelationshipId === relId);
    const relTrimLine = byRelationship(fixture.relationships.relTrim.id);
    expect(relTrimLine?.skuId).toBe(fixture.instances.trimInstance.skuId);
    expect(relTrimLine?.quantity).toBe(fixture.instances.trimInstance.quantity);

    const relStructuralLine = byRelationship(fixture.relationships.relStructural.id);
    expect(relStructuralLine?.skuId).toBe(fixture.instances.backSheetInstance.skuId);

    const byInstanceEdge = (edgeId: string) =>
      bom.lines.find((l) => l.sourceProductInstanceEdgeId === edgeId);
    const edgeLine = byInstanceEdge(fixture.productInstanceEdges.edgeToBackSheet.id);
    expect(edgeLine?.skuId).toBe(fixture.instances.panelInstance.skuId);

    const standaloneLine = bom.lines.find(
      (l) => l.sourceProductInstanceId === fixture.instances.furnitureInstance.id,
    );
    expect(standaloneLine?.skuId).toBe(fixture.instances.furnitureInstance.skuId);

    const furnitureAsRelationshipSource = bom.lines.find(
      (l) => l.sourceGeometryProductRelationshipId != null && l.skuId === fixture.instances.furnitureInstance.skuId,
    );
    expect(furnitureAsRelationshipSource).toBeUndefined();
  });

  it("regenerates in place, replacing the previous version rather than accumulating lines", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;
    await runAndPersistValidation(fixture.design.id);

    const first = await generateMasterBom(fixture.design.id);
    const second = await generateMasterBom(fixture.design.id);

    expect(second.version).toBe(first.version + 1);
    const remaining = await prisma.masterBom.findMany({ where: { templateId: fixture.design.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
  });

  it("falls back to productInstance.quantity when quantityRule is null", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;
    await runAndPersistValidation(fixture.design.id);

    const bom = await generateMasterBom(fixture.design.id);
    const line = bom.lines.find((l) => l.sourceGeometryProductRelationshipId === fixture.relationships.relStructural.id);
    expect(line?.quantity).toBe(fixture.instances.backSheetInstance.quantity);
  });

  it("applies a FIXED quantityRule, overriding productInstance.quantity", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;
    await prisma.geometryProductRelationship.update({
      where: { id: fixture.relationships.relStructural.id },
      data: { quantityRule: { type: "FIXED", value: 5 } },
    });
    await runAndPersistValidation(fixture.design.id);

    const bom = await generateMasterBom(fixture.design.id);
    const line = bom.lines.find((l) => l.sourceGeometryProductRelationshipId === fixture.relationships.relStructural.id);
    expect(line?.quantity).toBe(5);
  });

  it("applies a PER_LENGTH_MM quantityRule against the target panel's widthMm", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;
    // relStructural targets the 1200mm-wide panel node (geometryNodeId), so
    // 1200mm * 0.01 = 12 should override the instance's placed quantity of 1.
    await prisma.geometryProductRelationship.update({
      where: { id: fixture.relationships.relStructural.id },
      data: { quantityRule: { type: "PER_LENGTH_MM", perMm: 0.01 } },
    });
    await runAndPersistValidation(fixture.design.id);

    const bom = await generateMasterBom(fixture.design.id);
    const line = bom.lines.find((l) => l.sourceGeometryProductRelationshipId === fixture.relationships.relStructural.id);
    expect(line?.quantity).toBe(12);
  });
});
