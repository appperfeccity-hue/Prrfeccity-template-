import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addWallSegment, createWallSegment, resolveWallSegmentId } from "@/lib/graph/geometry";
import { deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
});

describe("resolveWallSegmentId", () => {
  it("returns the provided id when it belongs to the design", async () => {
    const design = await prisma.design.create({ data: { name: "Resolve Segment Fixture" } });
    designIdToCleanUp = design.id;
    const { segment } = await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });

    const resolved = await resolveWallSegmentId(design.id, segment.id);
    expect(resolved).toBe(segment.id);
  });

  it("404s when the provided id does not belong to this design", async () => {
    const design = await prisma.design.create({ data: { name: "Resolve Segment Fixture" } });
    designIdToCleanUp = design.id;
    await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });

    await expect(resolveWallSegmentId(design.id, "nonexistent-segment-id")).rejects.toThrow(/not found/i);
  });

  it("auto-defaults to the sole segment when omitted and exactly one exists", async () => {
    const design = await prisma.design.create({ data: { name: "Resolve Segment Fixture" } });
    designIdToCleanUp = design.id;
    const { segment } = await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });

    const resolved = await resolveWallSegmentId(design.id, undefined);
    expect(resolved).toBe(segment.id);
  });

  it("400s when omitted and 2 segments exist", async () => {
    const design = await prisma.design.create({ data: { name: "Resolve Segment Fixture" } });
    designIdToCleanUp = design.id;
    await createWallSegment(design.id, { lengthMm: 3000, heightMm: 2400 });
    await addWallSegment(design.id, { lengthMm: 2000, heightMm: 2400, angleDeg: 90 });

    await expect(resolveWallSegmentId(design.id, undefined)).rejects.toThrow(/more than one wall segment/i);
  });

  it("returns null when omitted and 0 segments exist", async () => {
    const design = await prisma.design.create({ data: { name: "Resolve Segment Fixture" } });
    designIdToCleanUp = design.id;

    const resolved = await resolveWallSegmentId(design.id, undefined);
    expect(resolved).toBeNull();
  });
});
