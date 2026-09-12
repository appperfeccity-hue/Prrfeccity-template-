import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createFixture, updateFixture, deleteFixture } from "@/lib/graph/fixture";
import { validateDesign } from "@/lib/graph/validation";
import { computeMasterBomLines } from "@/lib/graph/bom";
import { createProductInstance } from "@/lib/graph/product";
import { buildValidTemplateFixture, deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
});

describe("Fixture CRUD", () => {
  it("createFixture persists all fields, defaulting clearanceMm to 0 when omitted", async () => {
    const design = await prisma.design.create({ data: { name: "Fixture CRUD Fixture" } });
    designIdToCleanUp = design.id;

    const fx = await createFixture(design.id, {
      fixtureType: "TV",
      label: "Living room TV",
      xMm: 100,
      yMm: 200,
      widthMm: 1200,
      heightMm: 700,
    });

    expect(fx.fixtureType).toBe("TV");
    expect(fx.label).toBe("Living room TV");
    expect(fx.xMm).toBe(100);
    expect(fx.yMm).toBe(200);
    expect(fx.widthMm).toBe(1200);
    expect(fx.heightMm).toBe(700);
    expect(fx.clearanceMm).toBe(0);
  });

  it("updateFixture partial-updates a single field without touching others", async () => {
    const design = await prisma.design.create({ data: { name: "Fixture CRUD Fixture 2" } });
    designIdToCleanUp = design.id;
    const fx = await createFixture(design.id, {
      fixtureType: "WINDOW",
      xMm: 0,
      yMm: 0,
      widthMm: 900,
      heightMm: 1200,
      clearanceMm: 50,
    });

    const updated = await updateFixture(fx.id, { widthMm: 1000 });
    expect(updated.widthMm).toBe(1000);
    expect(updated.heightMm).toBe(1200);
    expect(updated.clearanceMm).toBe(50);
    expect(updated.fixtureType).toBe("WINDOW");
  });

  it("updateFixture on a nonexistent id throws notFound", async () => {
    await expect(updateFixture("does-not-exist", { widthMm: 100 })).rejects.toMatchObject({ status: 404 });
  });

  it("deleteFixture removes the row", async () => {
    const design = await prisma.design.create({ data: { name: "Fixture CRUD Fixture 3" } });
    designIdToCleanUp = design.id;
    const fx = await createFixture(design.id, {
      fixtureType: "DOOR",
      xMm: 0,
      yMm: 0,
      widthMm: 900,
      heightMm: 2100,
    });

    await deleteFixture(fx.id);
    const found = await prisma.fixture.findUnique({ where: { id: fx.id } });
    expect(found).toBeNull();
  });
});

describe("FIXTURE_CLEARANCE_OVERLAP", () => {
  // buildValidTemplateFixture's furnitureInstance is SKU-FURN-VANITY-01,
  // sizeOption SMALL (widthMm:600, heightMm:850), placed at x:100,y:100 --
  // its elevation-plane box (center-anchored) spans x:[-200,400], y:[-325,525].

  it("flags a Fixture whose raw box overlaps the furniture instance's footprint", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    await createFixture(fixture.design.id, {
      fixtureType: "TV",
      xMm: 0,
      yMm: 0,
      widthMm: 100,
      heightMm: 100,
    });

    const issues = await validateDesign(fixture.design.id);
    const overlap = issues.find((i) => i.code === "FIXTURE_CLEARANCE_OVERLAP");
    expect(overlap).toBeDefined();
    expect(overlap?.severity).toBe("ERROR");
    expect(overlap?.refId).toBe(fixture.instances.furnitureInstance.id);
  });

  it("flags an overlap that only exists once clearanceMm expands the fixture's box", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    // Furniture box's maxX is 400. Placed just outside it (minX=450), with
    // no clearance there's no overlap; a 100mm clearance pulls the
    // fixture's effective minX to 350, which does overlap.
    const fx = await createFixture(fixture.design.id, {
      fixtureType: "AC_UNIT",
      xMm: 450,
      yMm: 0,
      widthMm: 50,
      heightMm: 100,
    });

    const withoutClearance = await validateDesign(fixture.design.id);
    expect(withoutClearance.some((i) => i.code === "FIXTURE_CLEARANCE_OVERLAP")).toBe(false);

    await updateFixture(fx.id, { clearanceMm: 100 });
    const withClearance = await validateDesign(fixture.design.id);
    const overlap = withClearance.find((i) => i.code === "FIXTURE_CLEARANCE_OVERLAP");
    expect(overlap).toBeDefined();
    expect(overlap?.refId).toBe(fixture.instances.furnitureInstance.id);
  });

  it("does not flag a Fixture placed clear of every furniture instance", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    await createFixture(fixture.design.id, {
      fixtureType: "WINDOW",
      xMm: 5000,
      yMm: 5000,
      widthMm: 900,
      heightMm: 1200,
    });

    const issues = await validateDesign(fixture.design.id);
    expect(issues.some((i) => i.code === "FIXTURE_CLEARANCE_OVERLAP")).toBe(false);
  });

  it("does not flag a furniture instance with no resolved sizeOptionId (rule 12b's job instead)", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    // A second furniture instance, geometrically overlapping the fixture
    // below, but with no sizeOptionId -- no footprint to check against.
    const noSizeInstance = await createProductInstance(fixture.design.id, {
      skuId: fixture.instances.furnitureInstance.skuId,
      x: 0,
      y: 0,
    });

    await createFixture(fixture.design.id, {
      fixtureType: "TV",
      xMm: 0,
      yMm: 0,
      widthMm: 100,
      heightMm: 100,
    });

    const issues = await validateDesign(fixture.design.id);
    const overlapForNoSizeInstance = issues.find(
      (i) => i.code === "FIXTURE_CLEARANCE_OVERLAP" && i.refId === noSizeInstance.id,
    );
    expect(overlapForNoSizeInstance).toBeUndefined();
    expect(issues.some((i) => i.code === "FURNITURE_CONFIGURATION_COMPLETE" && i.refId === noSizeInstance.id)).toBe(
      true,
    );
  });

  it("does not flag a non-furniture instance geometrically under a Fixture's box", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    // backSheetInstance is STRUCTURAL-category, freestanding-attached to
    // the panel node with no x/y of its own -- give it one directly to
    // simulate the "geometrically under the fixture" adversarial case.
    await prisma.productInstance.update({
      where: { id: fixture.instances.backSheetInstance.id },
      data: { x: 0, y: 0 },
    });

    await createFixture(fixture.design.id, {
      fixtureType: "TV",
      xMm: 0,
      yMm: 0,
      widthMm: 100,
      heightMm: 100,
    });

    const issues = await validateDesign(fixture.design.id);
    expect(
      issues.some((i) => i.code === "FIXTURE_CLEARANCE_OVERLAP" && i.refId === fixture.instances.backSheetInstance.id),
    ).toBe(false);
  });
});

describe("Fixtures never enter the Master BOM", () => {
  it("computeMasterBomLines is byte-identical with and without Fixtures placed, including an adversarially-overlapping one", async () => {
    const fixture = await buildValidTemplateFixture();
    designIdToCleanUp = fixture.design.id;

    const linesBefore = await computeMasterBomLines(fixture.design.id);

    await createFixture(fixture.design.id, { fixtureType: "TV", xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 });
    await createFixture(fixture.design.id, { fixtureType: "WINDOW", xMm: 50, yMm: 50, widthMm: 900, heightMm: 1200 });
    // Deliberately overlaps the furniture instance's footprint.
    await createFixture(fixture.design.id, {
      fixtureType: "AC_UNIT",
      xMm: 100,
      yMm: 100,
      widthMm: 50,
      heightMm: 50,
    });

    const linesAfter = await computeMasterBomLines(fixture.design.id);

    expect(linesAfter.length).toBe(linesBefore.length);
    expect(linesAfter.map((l) => l.skuId).sort()).toEqual(linesBefore.map((l) => l.skuId).sort());
  });
});
