import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateSkuMaster, discontinueSkuMaster, assertSkuNotDiscontinued } from "@/lib/graph/sku";
import { createProductInstance } from "@/lib/graph/product";
import { autoFillPartition, createWall, createZone, createPartition } from "@/lib/graph/geometry";
import { computeMasterBomLines, generateMasterBom } from "@/lib/graph/bom";
import { runAndPersistValidation } from "@/lib/graph/validation";
import { buildValidTemplateFixture, deleteFixtureDesign } from "./helpers";

let skuIdToCleanUp: string | undefined;
let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp).catch(() => {});
    designIdToCleanUp = undefined;
  }
  if (skuIdToCleanUp) {
    await prisma.skuMaster.delete({ where: { id: skuIdToCleanUp } }).catch(() => {});
    skuIdToCleanUp = undefined;
  }
});

async function createThrowawaySku(overrides: { defaultWidthMm?: number } = {}) {
  const category = await prisma.category.findUniqueOrThrow({ where: { key: "STRUCTURAL" } });
  const sku = await prisma.skuMaster.create({
    data: {
      code: `SKU-VERSIONING-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: "Versioning Test SKU",
      categoryId: category.id,
      defaultWidthMm: overrides.defaultWidthMm ?? 500,
      defaultUnit: "EA",
    },
  });
  await prisma.skuMasterVersion.create({
    data: {
      skuId: sku.id,
      version: 1,
      code: sku.code,
      name: sku.name,
      categoryId: sku.categoryId,
      defaultWidthMm: sku.defaultWidthMm,
      defaultUnit: sku.defaultUnit,
      minCutPieceMm: sku.minCutPieceMm,
      attributes: sku.attributes ?? undefined,
      rotatable: sku.rotatable,
    },
  });
  skuIdToCleanUp = sku.id;
  return sku;
}

describe("updateSkuMaster -- version bumping", () => {
  it("bumps currentVersion and freezes a new snapshot when a physical field changes", async () => {
    const sku = await createThrowawaySku();
    const updated = await updateSkuMaster(sku.id, { defaultWidthMm: 750 });
    expect(updated.currentVersion).toBe(2);
    expect(updated.defaultWidthMm).toBe(750);

    const versions = await prisma.skuMasterVersion.findMany({ where: { skuId: sku.id }, orderBy: { version: "asc" } });
    expect(versions).toHaveLength(2);
    expect(versions[0].defaultWidthMm).toBe(500); // the original snapshot is untouched
    expect(versions[1].defaultWidthMm).toBe(750);
  });

  it("does NOT bump currentVersion for a cosmetic-only change (name/code)", async () => {
    const sku = await createThrowawaySku();
    const updated = await updateSkuMaster(sku.id, { name: "Renamed Test SKU" });
    expect(updated.currentVersion).toBe(1);
    expect(updated.name).toBe("Renamed Test SKU");

    const versions = await prisma.skuMasterVersion.findMany({ where: { skuId: sku.id } });
    expect(versions).toHaveLength(1);
  });

  it("does NOT bump currentVersion when the submitted value equals the current one (no-op edit)", async () => {
    const sku = await createThrowawaySku();
    const updated = await updateSkuMaster(sku.id, { defaultWidthMm: 500, rotatable: sku.rotatable });
    expect(updated.currentVersion).toBe(1);
  });

  it("bumps on rotatable and categoryId changes too", async () => {
    const sku = await createThrowawaySku();
    const afterRotatable = await updateSkuMaster(sku.id, { rotatable: false });
    expect(afterRotatable.currentVersion).toBe(2);

    const otherCategory = await prisma.category.findUniqueOrThrow({ where: { key: "CONNECTION" } });
    const afterCategory = await updateSkuMaster(sku.id, { categoryId: otherCategory.id });
    expect(afterCategory.currentVersion).toBe(3);
  });

  it("throws not-found for a nonexistent SKU", async () => {
    await expect(updateSkuMaster("does-not-exist", { name: "x" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("MasterBomLine.skuVersionId pinning", () => {
  it("computeMasterBomLines pins each line to the SKU's currentVersion at the time it's computed", async () => {
    const sku = await createThrowawaySku();
    const design = await prisma.design.create({ data: { name: "BOM Version Pin Fixture" } });
    designIdToCleanUp = design.id;
    await createProductInstance(design.id, { skuId: sku.id, x: 0, y: 0, quantity: 1 });

    const lines = await computeMasterBomLines(design.id);
    expect(lines).toHaveLength(1);
    const version1 = await prisma.skuMasterVersion.findFirstOrThrow({ where: { skuId: sku.id, version: 1 } });
    expect(lines[0].skuVersionId).toBe(version1.id);
  });

  it("a generated BOM line's skuVersionId does not move when the SKU is edited afterward", async () => {
    const sku = await createThrowawaySku();
    // Build on top of an already-known-valid template rather than hand-rolling
    // minimal geometry -- generateMasterBom requires passing validation, and
    // reusing the established fixture keeps this test focused on version
    // pinning, not on re-deriving what makes a design valid.
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;
    const design = fixture.design;
    await createProductInstance(design.id, { skuId: sku.id, x: 0, y: 0, quantity: 1 });
    await runAndPersistValidation(design.id);
    const bom = await generateMasterBom(design.id);

    const versionAtGenTime = await prisma.skuMasterVersion.findFirstOrThrow({ where: { skuId: sku.id, version: 1 } });
    const line = bom.lines.find((l) => l.skuId === sku.id)!;
    expect(line.skuVersionId).toBe(versionAtGenTime.id);

    // Now bump the SKU's version -- the already-generated line must keep
    // pointing at version 1, not silently follow the SKU to version 2.
    await updateSkuMaster(sku.id, { defaultWidthMm: 999 });
    const lineAfterEdit = await prisma.masterBomLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(lineAfterEdit.skuVersionId).toBe(versionAtGenTime.id);

    // Regenerating the BOM (still allowed -- design is still DRAFT) re-pins
    // to whatever is current *now*, i.e. version 2.
    const regenerated = await generateMasterBom(design.id);
    const version2 = await prisma.skuMasterVersion.findFirstOrThrow({ where: { skuId: sku.id, version: 2 } });
    const regeneratedLine = regenerated.lines.find((l) => l.skuId === sku.id)!;
    expect(regeneratedLine.skuVersionId).toBe(version2.id);
  });
});

describe("Discontinuation", () => {
  it("blocks createProductInstance for a discontinued SKU", async () => {
    const sku = await createThrowawaySku();
    await discontinueSkuMaster(sku.id);
    const design = await prisma.design.create({ data: { name: "Discontinued Placement Fixture" } });
    designIdToCleanUp = design.id;

    await expect(createProductInstance(design.id, { skuId: sku.id })).rejects.toMatchObject({ status: 400 });
  });

  it("blocks autoFillPartition for a discontinued PRIMARY SKU", async () => {
    const primaryCategory = await prisma.category.findUniqueOrThrow({ where: { key: "PRIMARY" } });
    const sku = await prisma.skuMaster.create({
      data: {
        code: `SKU-VERSIONING-PANEL-${Date.now()}`,
        name: "Discontinued Panel Test",
        categoryId: primaryCategory.id,
        defaultWidthMm: 600,
        minCutPieceMm: 100,
      },
    });
    skuIdToCleanUp = sku.id;
    await discontinueSkuMaster(sku.id);

    const design = await prisma.design.create({ data: { name: "Discontinued Autofill Fixture" } });
    designIdToCleanUp = design.id;
    const { wall } = await createWall(design.id, { wallType: "STRAIGHT_LTR", lengthMm: 1200, heightMm: 2400 });
    const { zone } = await createZone(design.id, {
      wallId: wall.id,
      associatesWith: "WALL",
      orderIndex: 0,
      widthMm: 1200,
      heightMm: 2400,
      hasCoveLighting: false,
    });
    const partition = await createPartition(design.id, zone.id, { orderIndex: 0, widthMm: 1200, heightMm: 2400 });

    await expect(autoFillPartition(design.id, partition.id, sku.id)).rejects.toMatchObject({ status: 400 });
  });

  it("does not disturb an already-placed instance or already-generated BOM line", async () => {
    const sku = await createThrowawaySku();
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;
    const design = fixture.design;
    const instance = await createProductInstance(design.id, { skuId: sku.id, x: 0, y: 0, quantity: 1 });
    await runAndPersistValidation(design.id);
    const bom = await generateMasterBom(design.id);
    const line = bom.lines.find((l) => l.skuId === sku.id)!;

    await discontinueSkuMaster(sku.id);

    const instanceAfter = await prisma.productInstance.findUniqueOrThrow({ where: { id: instance.id } });
    const lineAfter = await prisma.masterBomLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(instanceAfter.id).toBe(instance.id);
    expect(lineAfter.id).toBe(line.id);
  });

  it("is idempotent -- discontinuing an already-discontinued SKU does not error", async () => {
    const sku = await createThrowawaySku();
    await discontinueSkuMaster(sku.id);
    const secondCall = await discontinueSkuMaster(sku.id);
    expect(secondCall.discontinuedAt).not.toBeNull();
  });
});

describe("assertSkuNotDiscontinued (pure guard)", () => {
  it("throws a 400 for a discontinued sku, passes through a live one", () => {
    expect(() => assertSkuNotDiscontinued({ discontinuedAt: new Date(), code: "X" })).toThrow();
    expect(() => assertSkuNotDiscontinued({ discontinuedAt: null, code: "X" })).not.toThrow();
  });
});
