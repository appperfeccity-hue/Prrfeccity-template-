import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createUser } from "@/lib/graph/auth";
import { updateProjectProductInstance, setProjectEdgeTreatment } from "@/lib/graph/project";
import { buildPublishedProjectTemplateFixture } from "./helpers";

let designIdsToCleanUp: string[] = [];
let userIdsToCleanUp: string[] = [];

afterEach(async () => {
  for (const designId of designIdsToCleanUp) {
    // Project.templateId has no onDelete: Cascade -- Projects must be
    // removed before their template Design (see project-guards.test.ts).
    await prisma.project.deleteMany({ where: { templateId: designId } });
    await prisma.design.delete({ where: { id: designId } });
  }
  designIdsToCleanUp = [];
  for (const userId of userIdsToCleanUp) {
    await prisma.user.delete({ where: { id: userId } });
  }
  userIdsToCleanUp = [];
});

async function buildFixture(opts?: { furnitureSkuCode?: string }) {
  const user = await createUser({
    email: `project-permissions-test-${Date.now()}-${Math.random()}@example.com`,
    password: "correct-horse-battery-staple",
    name: "Test Consultant",
    role: "CONSULTANT",
  });
  userIdsToCleanUp.push(user.id);
  const fixture = await buildPublishedProjectTemplateFixture(user.id, opts);
  designIdsToCleanUp.push(fixture.design.id);
  return fixture;
}

async function skuId(code: string) {
  const sku = await prisma.skuMaster.findUniqueOrThrow({ where: { code } });
  return sku.id;
}

describe("QUANTITY", () => {
  it("accepts a value inside [min,max]", async () => {
    const fx = await buildFixture();
    const updated = await updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { quantity: 3 });
    expect(updated.quantity).toBe(3);
  });

  it("rejects a value below min", async () => {
    const fx = await buildFixture();
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { quantity: 0 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a value above max", async () => {
    const fx = await buildFixture();
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { quantity: 6 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("403s (not 400) when no TemplateParameter targets this field at all", async () => {
    const fx = await buildFixture();
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectBackSheetInstance.id, { quantity: 2 }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("NUMERIC_RANGE (rotationDeg)", () => {
  it("accepts an in-bounds rotationDeg", async () => {
    const fx = await buildFixture();
    const updated = await updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { rotationDeg: 90 });
    expect(updated.rotationDeg).toBe(90);
  });

  it("rejects an out-of-bounds rotationDeg", async () => {
    const fx = await buildFixture();
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { rotationDeg: 400 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects entirely (400) when sku.rotatable === false, even though a valid permission exists", async () => {
    const fx = await buildFixture({ furnitureSkuCode: "SKU-FURN-STOOL-01" });
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { rotationDeg: 90 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("403s (not 400) when no TemplateParameter targets this field at all", async () => {
    const fx = await buildFixture();
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectBackSheetInstance.id, { rotationDeg: 45 }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("POSITION", () => {
  it("accepts all three axes in-bounds in one call", async () => {
    const fx = await buildFixture();
    const updated = await updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, {
      x: 500,
      y: 500,
      z: 500,
    });
    expect(updated.x).toBe(500);
    expect(updated.y).toBe(500);
    expect(updated.z).toBe(500);
  });

  it("rejects when any single axis is out-of-bounds, proving per-axis independence", async () => {
    const fx = await buildFixture();
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { x: 500, y: 500, z: 5000 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("403s (not 400) when no TemplateParameter targets this field at all", async () => {
    const fx = await buildFixture();
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectBackSheetInstance.id, { x: 10 }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("SKU_SUBSTITUTION", () => {
  it("accepts the one allowed alternate SKU code", async () => {
    const fx = await buildFixture();
    const altSkuId = await skuId("SKU-TRIM-EDGE-01");
    const updated = await updateProjectProductInstance(fx.project.id, fx.projectConnectorInstance.id, { skuId: altSkuId });
    expect(updated.skuId).toBe(altSkuId);
  });

  it("rejects an arbitrary third SKU not in allowedValues", async () => {
    const fx = await buildFixture();
    const thirdSkuId = await skuId("SKU-DECOR-PROFILE-01");
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectConnectorInstance.id, { skuId: thirdSkuId }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("403s (not 400) when no TemplateParameter targets this field at all", async () => {
    const fx = await buildFixture();
    const otherSkuId = await skuId("SKU-DECOR-PROFILE-01");
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectBackSheetInstance.id, { skuId: otherSkuId }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("ENUM_SELECTION (colourOptionId)", () => {
  it("accepts the allowed colour key", async () => {
    const fx = await buildFixture();
    const whiteOption = await prisma.furnitureColourOption.findFirstOrThrow({
      where: { skuId: await skuId("SKU-FURN-VANITY-01"), key: "WHITE" },
    });
    const updated = await updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, {
      colourOptionId: whiteOption.id,
    });
    expect(updated.colourOptionId).toBe(whiteOption.id);
  });

  it("rejects a colour key that exists on the SKU but isn't in allowedValues", async () => {
    const fx = await buildFixture();
    const walnutOption = await prisma.furnitureColourOption.findFirstOrThrow({
      where: { skuId: await skuId("SKU-FURN-VANITY-01"), key: "WALNUT" },
    });
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { colourOptionId: walnutOption.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an option id that belongs to a different SKU entirely", async () => {
    const fx = await buildFixture();
    const blackOption = await prisma.furnitureColourOption.findFirstOrThrow({
      where: { skuId: await skuId("SKU-FURN-STOOL-01"), key: "BLACK" },
    });
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { colourOptionId: blackOption.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("403s (not 400) when no TemplateParameter targets this option group (sizeOptionId, unwired)", async () => {
    const fx = await buildFixture();
    // A valid, belongs-to-this-SKU option -- proves the 403 comes from the
    // missing SIZE_OPTION parameter, not from a referential-integrity 400.
    const sameSizeOptionId = fx.instances.furnitureInstance.sizeOptionId!;
    await expect(
      updateProjectProductInstance(fx.project.id, fx.projectFurnitureInstance.id, { sizeOptionId: sameSizeOptionId }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("EDGE_TREATMENT", () => {
  it("accepts a swap to the allowed connector SKU, synthesizes a Project-only instance, reassigns the relationship, and cleans up the now-unreferenced old instance", async () => {
    const fx = await buildFixture();
    const connectorSkuId = await skuId("SKU-CONNECTOR-H");

    const updatedRel = await setProjectEdgeTreatment(fx.project.id, fx.edgeStart.id, connectorSkuId);

    expect(updatedRel.productInstance.skuId).toBe(connectorSkuId);
    expect(updatedRel.productInstance.sourceProductInstanceId).toBeNull();

    const oldInstanceStillExists = await prisma.projectProductInstance.findUnique({
      where: { id: fx.projectTrimInstance.id },
    });
    expect(oldInstanceStillExists).toBeNull();
  });

  it("rejects a swap to a SKU not in allowedValues", async () => {
    const fx = await buildFixture();
    const decorSkuId = await skuId("SKU-DECOR-PROFILE-01");
    await expect(setProjectEdgeTreatment(fx.project.id, fx.edgeStart.id, decorSkuId)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("403s (not 400) when no TemplateParameter targets this edge at all", async () => {
    const fx = await buildFixture();
    const connectorSkuId = await skuId("SKU-CONNECTOR-H");
    await expect(setProjectEdgeTreatment(fx.project.id, fx.edgeEnd.id, connectorSkuId)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("chained substitution is not supported", () => {
  it("rejects any bounded edit against an EDGE_TREATMENT-synthesized instance (sourceProductInstanceId: null)", async () => {
    const fx = await buildFixture();
    const connectorSkuId = await skuId("SKU-CONNECTOR-H");
    const updatedRel = await setProjectEdgeTreatment(fx.project.id, fx.edgeStart.id, connectorSkuId);

    await expect(
      updateProjectProductInstance(fx.project.id, updatedRel.productInstanceId, { quantity: 2 }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
