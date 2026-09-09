import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireDraftDesign, requireDesign } from "@/lib/api/guards";
import { deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
});

describe("requireDraftDesign (the guard every mutating route -- canvas or Inspector -- goes through)", () => {
  it("returns the design when it is a DRAFT", async () => {
    const design = await prisma.design.create({ data: { name: "Draft Fixture" } });
    designIdToCleanUp = design.id;

    const result = await requireDraftDesign(design.id);
    expect(result.id).toBe(design.id);
    expect(result.status).toBe("DRAFT");
  });

  it("throws a conflict for a PUBLISHED design -- Inspector mutations get no special bypass", async () => {
    const design = await prisma.design.create({ data: { name: "Published Fixture", status: "PUBLISHED" } });
    designIdToCleanUp = design.id;

    await expect(requireDraftDesign(design.id)).rejects.toMatchObject({ status: 409 });
  });

  it("throws not-found for a nonexistent design", async () => {
    await expect(requireDraftDesign("does-not-exist")).rejects.toMatchObject({ status: 404 });
  });
});

describe("requireDesign (used by presentation-only routes, e.g. live preview -- no draft gate)", () => {
  it("returns a PUBLISHED design without throwing", async () => {
    const design = await prisma.design.create({ data: { name: "Published Fixture 2", status: "PUBLISHED" } });
    designIdToCleanUp = design.id;

    const result = await requireDesign(design.id);
    expect(result.id).toBe(design.id);
  });
});
