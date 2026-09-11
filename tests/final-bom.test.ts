import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createUser } from "@/lib/graph/auth";
import { updateProjectProductInstance, setProjectEdgeTreatment } from "@/lib/graph/project";
import { computeFinalBomLines, generateFinalBom } from "@/lib/graph/final-bom";
import { buildPublishedProjectTemplateFixture } from "./helpers";

let designIdsToCleanUp: string[] = [];
let userIdsToCleanUp: string[] = [];

afterEach(async () => {
  for (const designId of designIdsToCleanUp) {
    await prisma.project.deleteMany({ where: { templateId: designId } });
    await prisma.design.delete({ where: { id: designId } });
  }
  designIdsToCleanUp = [];
  for (const userId of userIdsToCleanUp) {
    await prisma.user.delete({ where: { id: userId } });
  }
  userIdsToCleanUp = [];
});

async function buildFixture() {
  const user = await createUser({
    email: `final-bom-test-${Date.now()}-${Math.random()}@example.com`,
    password: "correct-horse-battery-staple",
    name: "Test Consultant",
    role: "CONSULTANT",
  });
  userIdsToCleanUp.push(user.id);
  const fixture = await buildPublishedProjectTemplateFixture(user.id);
  designIdsToCleanUp.push(fixture.design.id);
  return fixture;
}

async function skuId(code: string) {
  const sku = await prisma.skuMaster.findUniqueOrThrow({ where: { code } });
  return sku.id;
}

describe("computeFinalBomLines", () => {
  it("returns one line per provenance source, each with exactly one of the three source FKs set", async () => {
    const fx = await buildFixture();

    const lines = await computeFinalBomLines(fx.project.id);
    // 3 geometry-product relationships (trim, structural, connector-at-end)
    // + 2 product-instance edges (panel->backsheet, panel->connector)
    // + 1 freestanding furniture instance = 6.
    expect(lines).toHaveLength(6);

    for (const line of lines) {
      const sourceCount = [
        line.sourceProjectGeometryProductRelationshipId,
        line.sourceProjectProductInstanceEdgeId,
        line.sourceProjectProductInstanceId,
      ].filter((v) => v != null).length;
      expect(sourceCount).toBe(1);
    }

    const furnitureLine = lines.find((l) => l.sourceProjectProductInstanceId === fx.projectFurnitureInstance.id);
    expect(furnitureLine?.skuId).toBe(fx.projectFurnitureInstance.skuId);
  });
});

describe("generateFinalBom", () => {
  it("regenerates in place, replacing the previous version rather than accumulating lines", async () => {
    const fx = await buildFixture();

    const first = await generateFinalBom(fx.project.id);
    const second = await generateFinalBom(fx.project.id);

    expect(second.version).toBe(first.version + 1);
    const remaining = await prisma.finalBom.findMany({ where: { projectId: fx.project.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
  });

  it("reflects a QUANTITY-bounded edit's new value on the next generate", async () => {
    const fx = await buildFixture();

    await updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { quantity: 4 });
    const bom = await generateFinalBom(fx.project.id);

    const line = bom.lines.find((l) => l.sourceProjectProductInstanceId === fx.projectFurnitureInstance.id);
    expect(line?.quantity).toBe(4);
  });

  it("reflects an EDGE_TREATMENT swap -- the line via that relationship id now traces to the new SKU", async () => {
    const fx = await buildFixture();
    const connectorSkuId = await skuId("SKU-CONNECTOR-H");
    const trimSkuId = await skuId("SKU-TRIM-EDGE-01");

    const projectRel = await prisma.projectGeometryProductRelationship.findFirstOrThrow({
      where: { projectId: fx.project.id, geometryEdgeId: fx.edgeStart.id },
    });

    await setProjectEdgeTreatment(fx.project.id, fx.edgeStart.id, connectorSkuId);
    const bom = await generateFinalBom(fx.project.id);

    const line = bom.lines.find((l) => l.sourceProjectGeometryProductRelationshipId === projectRel.id);
    expect(line?.skuId).toBe(connectorSkuId);
    expect(line?.skuId).not.toBe(trimSkuId);
  });

  it("never touches the source Template's Master BOM -- structurally incapable, not just coincidentally unaffected", async () => {
    const fx = await buildFixture();

    await updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { quantity: 4 });
    await generateFinalBom(fx.project.id);
    await generateFinalBom(fx.project.id);

    const masterBomsAfter = await prisma.masterBom.findMany({ where: { templateId: fx.design.id } });
    expect(masterBomsAfter).toHaveLength(1);
    expect(masterBomsAfter[0].id).toBe(fx.masterBomSnapshot.id);
    expect(masterBomsAfter[0].version).toBe(fx.masterBomSnapshot.version);

    const masterBomLines = await prisma.masterBomLine.findMany({ where: { masterBomId: fx.masterBomSnapshot.id } });
    expect(masterBomLines).toHaveLength(fx.masterBomSnapshot.lineCount);
  });
});
