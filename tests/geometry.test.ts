import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createWallSegment,
  addWallSegment,
  deleteWallSegment,
  createZone,
  createPartition,
  autoFillPartition,
} from "@/lib/graph/geometry";
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
  const { segment } = await createWallSegment(design.id, { lengthMm: widthMm, heightMm: 2400 });
  const { zone } = await createZone(design.id, {
    wallSegmentId: segment.id,
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

describe("createWallSegment / addWallSegment / deleteWallSegment", () => {
  it("createWallSegment creates segment 0 with 4 edges (LEFT/RIGHT/TOP/BOTTOM), no CORNER", async () => {
    const design = await prisma.design.create({ data: { name: "Wall Segment Fixture" } });
    designIdToCleanUp = design.id;

    const { segment, edges } = await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });

    expect(segment.sequence).toBe(0);
    expect(edges).toHaveLength(4);
    expect(edges.map((e) => e.edgeRole).sort()).toEqual(["BOTTOM", "LEFT", "RIGHT", "TOP"]);
  });

  it("addWallSegment rejects a second segment before the first exists", async () => {
    const design = await prisma.design.create({ data: { name: "Wall Segment Fixture" } });
    designIdToCleanUp = design.id;

    await expect(
      addWallSegment(design.id, { lengthMm: 2000, heightMm: 2400, angleDeg: 90 }),
    ).rejects.toThrow(/first wall segment/i);
  });

  it("addWallSegment creates segment 1 plus a WallJunction connecting it to segment 0", async () => {
    const design = await prisma.design.create({ data: { name: "Wall Segment Fixture" } });
    designIdToCleanUp = design.id;
    const { segment: first } = await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });

    const { segment: second } = await addWallSegment(design.id, { lengthMm: 2000, heightMm: 2400, angleDeg: 135 });

    expect(second.sequence).toBe(1);
    const junction = await prisma.wallJunction.findFirstOrThrow({ where: { designId: design.id } });
    expect(junction.segmentAId).toBe(first.id);
    expect(junction.segmentBId).toBe(second.id);
    expect(junction.angleDeg).toBe(135);
  });

  it("rejects a third segment (cap of 2)", async () => {
    const design = await prisma.design.create({ data: { name: "Wall Segment Fixture" } });
    designIdToCleanUp = design.id;
    await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });
    await addWallSegment(design.id, { lengthMm: 2000, heightMm: 2400, angleDeg: 90 });

    await expect(
      addWallSegment(design.id, { lengthMm: 1000, heightMm: 2400, angleDeg: 90 }),
    ).rejects.toThrow(/at most 2 wall segments/i);
  });

  it("createWallSegment (replace) rejects while a second segment exists", async () => {
    const design = await prisma.design.create({ data: { name: "Wall Segment Fixture" } });
    designIdToCleanUp = design.id;
    await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });
    await addWallSegment(design.id, { lengthMm: 2000, heightMm: 2400, angleDeg: 90 });

    await expect(
      createWallSegment(design.id, { lengthMm: 3500, heightMm: 2400 }),
    ).rejects.toThrow(/delete the second wall segment/i);
  });

  it("deleteWallSegment rejects deleting segment 0 while segment 1 exists", async () => {
    const design = await prisma.design.create({ data: { name: "Wall Segment Fixture" } });
    designIdToCleanUp = design.id;
    const { segment: first } = await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });
    await addWallSegment(design.id, { lengthMm: 2000, heightMm: 2400, angleDeg: 90 });

    await expect(deleteWallSegment(design.id, first.id)).rejects.toThrow(/delete the second wall segment first/i);
  });

  it("deleting segment 1 cascades away its WallJunction row", async () => {
    const design = await prisma.design.create({ data: { name: "Wall Segment Fixture" } });
    designIdToCleanUp = design.id;
    await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });
    const { segment: second } = await addWallSegment(design.id, { lengthMm: 2000, heightMm: 2400, angleDeg: 90 });

    await deleteWallSegment(design.id, second.id);

    const junctions = await prisma.wallJunction.findMany({ where: { designId: design.id } });
    expect(junctions).toHaveLength(0);
  });
});
