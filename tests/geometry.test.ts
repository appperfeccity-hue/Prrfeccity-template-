import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createWall, createZone, createPartition, autoFillPartition } from "@/lib/graph/geometry";
import { deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;
let skuIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
  if (skuIdToCleanUp) {
    await prisma.skuMaster.delete({ where: { id: skuIdToCleanUp } });
    skuIdToCleanUp = undefined;
  }
});

async function buildEmptyPartitionFixture(widthMm: number) {
  const design = await prisma.design.create({ data: { name: "Auto-fill Fixture" } });
  const { wall } = await createWall(design.id, { wallType: "STRAIGHT_LTR", lengthMm: widthMm, heightMm: 2400 });
  const { zone } = await createZone(design.id, {
    wallId: wall.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm,
    heightMm: 2400,
    hasCoveLighting: false,
  });
  const partition = await createPartition(design.id, zone.id, { orderIndex: 0, widthMm, heightMm: 2400 });
  return { design, partition };
}

describe("autoFillPartition", () => {
  it("tiles a partition that divides evenly with no offcut", async () => {
    const { design, partition } = await buildEmptyPartitionFixture(1200);
    designIdToCleanUp = design.id;
    const sku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PANEL-600" } });

    const result = await autoFillPartition(design.id, partition.id, sku.id);

    expect(result.fill.count).toBe(2);
    expect(result.fill.remainderMm).toBe(0);
    expect(result.fill.hasOffcut).toBe(false);
    expect(result.fill.offcutReusable).toBeNull();
    expect(result.panels).toHaveLength(2);
    expect(result.panels.every((p) => p.productInstance !== null)).toBe(true);
  });

  it("reduces the panel count by one to avoid a sub-minimum offcut when a larger remainder is available", async () => {
    // SKU-PANEL-600 has minCutPieceMm: 100. A 1250mm partition raw-divides into
    // 2 panels with a 50mm remainder (below the 100mm minimum), so the algorithm
    // should back off to 1 panel, yielding a larger, usable 650mm offcut instead.
    const { design, partition } = await buildEmptyPartitionFixture(1250);
    designIdToCleanUp = design.id;
    const sku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PANEL-600" } });

    const result = await autoFillPartition(design.id, partition.id, sku.id);

    expect(result.fill.count).toBe(1);
    expect(result.fill.remainderMm).toBe(650);
    expect(result.fill.hasOffcut).toBe(true);
    expect(result.fill.offcutReusable).toBe(true);
  });

  it("accepts a sub-minimum offcut and flags it non-reusable when count cannot be reduced below 1", async () => {
    // A 650mm partition raw-divides into 1 panel with a 50mm remainder (below the
    // 100mm minimum). Since rawCount is already 1, there's no smaller count to
    // fall back to, so the sub-minimum offcut is accepted and flagged as waste.
    const { design, partition } = await buildEmptyPartitionFixture(650);
    designIdToCleanUp = design.id;
    const sku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PANEL-600" } });

    const result = await autoFillPartition(design.id, partition.id, sku.id);

    expect(result.fill.count).toBe(1);
    expect(result.fill.remainderMm).toBe(50);
    expect(result.fill.hasOffcut).toBe(true);
    expect(result.fill.offcutReusable).toBe(false);
  });

  it("rejects auto-fill on a partition that already has panels", async () => {
    const { design, partition } = await buildEmptyPartitionFixture(1200);
    designIdToCleanUp = design.id;
    const sku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-PANEL-600" } });

    await autoFillPartition(design.id, partition.id, sku.id);
    await expect(autoFillPartition(design.id, partition.id, sku.id)).rejects.toThrow(/empty partition/i);
  });

  it("rejects auto-fill with a SKU that has no defaultWidthMm", async () => {
    const { design, partition } = await buildEmptyPartitionFixture(1200);
    designIdToCleanUp = design.id;
    const primaryCategory = await prisma.category.findUniqueOrThrow({ where: { key: "PRIMARY" } });
    // A PRIMARY-category SKU with no defaultWidthMm set, to isolate this check from the category check.
    const sku = await prisma.skuMaster.create({
      data: { code: "SKU-TEST-NO-WIDTH", name: "Test No Width", categoryId: primaryCategory.id },
    });
    skuIdToCleanUp = sku.id;

    await expect(autoFillPartition(design.id, partition.id, sku.id)).rejects.toThrow(/defaultWidthMm/i);
  });
});
