import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createWallSegment } from "@/lib/graph/geometry";
import { createFixture } from "@/lib/graph/fixture";
import { createProductInstance } from "@/lib/graph/product";
import {
  createConstraint,
  deleteConstraint,
  checkConstraintSatisfied,
  buildConstraintResolutionContext,
} from "@/lib/graph/constraint";
import { deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
});

async function buildFixtureScenario() {
  const design = await prisma.design.create({ data: { name: "Constraint Test Fixture" } });
  designIdToCleanUp = design.id;

  const { segment } = await createWallSegment(design.id, { lengthMm: 2000, heightMm: 2400 });
  const edges = await prisma.geometryEdge.findMany({ where: { nodeId: segment.id } });
  const leftEdge = edges.find((e) => e.edgeRole === "LEFT")!;
  const rightEdge = edges.find((e) => e.edgeRole === "RIGHT")!;
  const topEdge = edges.find((e) => e.edgeRole === "TOP")!;
  const bottomEdge = edges.find((e) => e.edgeRole === "BOTTOM")!;

  const fixture = await createFixture(design.id, {
    fixtureType: "WINDOW",
    wallSegmentId: segment.id,
    xMm: 100,
    yMm: 200,
    widthMm: 300,
    heightMm: 400,
  });

  const furnitureSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-VANITY-01" } });
  const sizeOption = await prisma.furnitureSizeOption.findFirstOrThrow({
    where: { skuId: furnitureSku.id, key: "SMALL" },
  });
  const instance = await createProductInstance(design.id, {
    skuId: furnitureSku.id,
    wallSegmentId: segment.id,
    x: 900,
    y: 150,
    quantity: 1,
    sizeOptionId: sizeOption.id,
  });

  return { design, segment, leftEdge, rightEdge, topEdge, bottomEdge, fixture, instance, sizeOption };
}

describe("Constraint CRUD", () => {
  it("createConstraint persists a two-target constraint and deleteConstraint removes it", async () => {
    const { design, fixture, instance } = await buildFixtureScenario();

    const c = await createConstraint(design.id, {
      constraintType: "DISTANCE",
      targetA: { kind: "FIXTURE", id: fixture.id },
      targetB: { kind: "PRODUCT_INSTANCE", id: instance.id },
      axis: "X",
      valueMm: 800,
    });
    expect(c.constraintType).toBe("DISTANCE");
    expect(c.targetAKind).toBe("FIXTURE");
    expect(c.targetAFixtureId).toBe(fixture.id);
    expect(c.targetBKind).toBe("PRODUCT_INSTANCE");
    expect(c.targetBProductInstanceId).toBe(instance.id);

    await deleteConstraint(c.id);
    const found = await prisma.constraint.findUnique({ where: { id: c.id } });
    expect(found).toBeNull();
  });

  it("FIXED_POSITION persists a single-target constraint with all targetB columns null", async () => {
    const { design, instance } = await buildFixtureScenario();
    const c = await createConstraint(design.id, {
      constraintType: "FIXED_POSITION",
      targetA: { kind: "PRODUCT_INSTANCE", id: instance.id },
      axis: "X",
      valueMm: 900,
    });
    expect(c.targetBKind).toBeNull();
    expect(c.targetBFixtureId).toBeNull();
    expect(c.targetBProductInstanceId).toBeNull();
    expect(c.targetBGeometryNodeId).toBeNull();
    expect(c.targetBGeometryEdgeId).toBeNull();
  });
});

describe("Constraint shape validation (assertValidShape)", () => {
  it("rejects FIXED_POSITION with a targetB", async () => {
    const { design, instance, fixture } = await buildFixtureScenario();
    await expect(
      createConstraint(design.id, {
        constraintType: "FIXED_POSITION",
        targetA: { kind: "PRODUCT_INSTANCE", id: instance.id },
        targetB: { kind: "FIXTURE", id: fixture.id },
        axis: "X",
        valueMm: 100,
      }),
    ).rejects.toThrow();
  });

  it("rejects a non-FIXED_POSITION type with no targetB", async () => {
    const { design, instance } = await buildFixtureScenario();
    await expect(
      createConstraint(design.id, {
        constraintType: "DISTANCE",
        targetA: { kind: "PRODUCT_INSTANCE", id: instance.id },
        axis: "X",
        valueMm: 100,
      }),
    ).rejects.toThrow();
  });

  it("rejects a both-anchor pair (GEOMETRY_NODE + GEOMETRY_EDGE)", async () => {
    const { design, segment, leftEdge } = await buildFixtureScenario();
    await expect(
      createConstraint(design.id, {
        constraintType: "DISTANCE",
        targetA: { kind: "GEOMETRY_NODE", id: segment.id },
        targetB: { kind: "GEOMETRY_EDGE", id: leftEdge.id },
        axis: "X",
        valueMm: 100,
      }),
    ).rejects.toThrow();
  });

  it("rejects EQUAL with a GEOMETRY_NODE side", async () => {
    const { design, segment, instance } = await buildFixtureScenario();
    await expect(
      createConstraint(design.id, {
        constraintType: "EQUAL",
        targetA: { kind: "PRODUCT_INSTANCE", id: instance.id },
        targetB: { kind: "GEOMETRY_NODE", id: segment.id },
        axis: "X",
      }),
    ).rejects.toThrow();
  });

  it("rejects CENTER with a GEOMETRY_EDGE container", async () => {
    const { design, instance, leftEdge } = await buildFixtureScenario();
    await expect(
      createConstraint(design.id, {
        constraintType: "CENTER",
        targetA: { kind: "PRODUCT_INSTANCE", id: instance.id },
        targetB: { kind: "GEOMETRY_EDGE", id: leftEdge.id },
        axis: "X",
      }),
    ).rejects.toThrow();
  });

  it("rejects EDGE_TO_EDGE with a GEOMETRY_NODE side", async () => {
    const { design, segment, fixture } = await buildFixtureScenario();
    await expect(
      createConstraint(design.id, {
        constraintType: "EDGE_TO_EDGE",
        targetA: { kind: "FIXTURE", id: fixture.id },
        targetB: { kind: "GEOMETRY_NODE", id: segment.id },
        axis: "X",
        valueMm: 100,
      }),
    ).rejects.toThrow();
  });
});

describe("Constraint wall-anchor validation (assertWallAnchor)", () => {
  it("rejects a GEOMETRY_NODE anchor that isn't a wall segment in this design", async () => {
    const { design, fixture } = await buildFixtureScenario();
    const otherDesign = await prisma.design.create({ data: { name: "Other Design" } });
    try {
      const { segment: otherSegment } = await createWallSegment(otherDesign.id, { lengthMm: 1000, heightMm: 2000 });
      await expect(
        createConstraint(design.id, {
          constraintType: "DISTANCE",
          targetA: { kind: "FIXTURE", id: fixture.id },
          targetB: { kind: "GEOMETRY_NODE", id: otherSegment.id },
          axis: "X",
          valueMm: 100,
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.design.delete({ where: { id: otherDesign.id } });
    }
  });

  it("rejects a GEOMETRY_EDGE anchor whose role doesn't match the constraint's axis", async () => {
    const { design, fixture, leftEdge } = await buildFixtureScenario();
    // LEFT is a vertical edge -- meaningful only along X, not Y.
    await expect(
      createConstraint(design.id, {
        constraintType: "DISTANCE",
        targetA: { kind: "FIXTURE", id: fixture.id },
        targetB: { kind: "GEOMETRY_EDGE", id: leftEdge.id },
        axis: "Y",
        valueMm: 100,
      }),
    ).rejects.toThrow();
  });

  it("accepts a GEOMETRY_EDGE anchor whose role matches the axis", async () => {
    const { design, fixture, leftEdge } = await buildFixtureScenario();
    const c = await createConstraint(design.id, {
      constraintType: "DISTANCE",
      targetA: { kind: "FIXTURE", id: fixture.id },
      targetB: { kind: "GEOMETRY_EDGE", id: leftEdge.id },
      axis: "X",
      valueMm: 100,
    });
    expect(c.id).toBeTruthy();
  });
});

describe("checkConstraintSatisfied (per-type)", () => {
  it("DISTANCE: true when the axis gap matches valueMm, false otherwise", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [{ id: "fx1", xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 }],
      productInstances: [
        { id: "pi1", x: 500, y: 0, sku: { category: { key: "FURNITURE" } }, sizeOption: { widthMm: 200, heightMm: 200 } },
      ],
      segments: [],
      edges: [],
    });
    const base = {
      axis: "X" as const,
      minValueMm: null,
      maxValueMm: null,
      targetAKind: "FIXTURE" as const,
      targetAFixtureId: "fx1",
      targetAProductInstanceId: null,
      targetAGeometryNodeId: null,
      targetAGeometryEdgeId: null,
      targetBKind: "PRODUCT_INSTANCE" as const,
      targetBFixtureId: null,
      targetBProductInstanceId: "pi1",
      targetBGeometryNodeId: null,
      targetBGeometryEdgeId: null,
    };
    expect(checkConstraintSatisfied({ ...base, constraintType: "DISTANCE", valueMm: 500 }, ctx).satisfied).toBe(true);
    expect(checkConstraintSatisfied({ ...base, constraintType: "DISTANCE", valueMm: 100 }, ctx).satisfied).toBe(false);
  });

  it("ALIGN: true when both axis points match", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [
        { id: "fx1", xMm: 300, yMm: 0, widthMm: 100, heightMm: 100 },
        { id: "fx2", xMm: 300, yMm: 500, widthMm: 50, heightMm: 50 },
      ],
      productInstances: [],
      segments: [],
      edges: [],
    });
    const base = {
      axis: "X" as const,
      valueMm: null,
      minValueMm: null,
      maxValueMm: null,
      targetAKind: "FIXTURE" as const,
      targetAFixtureId: "fx1",
      targetAProductInstanceId: null,
      targetAGeometryNodeId: null,
      targetAGeometryEdgeId: null,
      targetBKind: "FIXTURE" as const,
      targetBFixtureId: "fx2",
      targetBProductInstanceId: null,
      targetBGeometryNodeId: null,
      targetBGeometryEdgeId: null,
    };
    expect(checkConstraintSatisfied({ ...base, constraintType: "ALIGN" }, ctx).satisfied).toBe(true);

    const misalignedCtx = buildConstraintResolutionContext({
      fixtures: [
        { id: "fx1", xMm: 300, yMm: 0, widthMm: 100, heightMm: 100 },
        { id: "fx2", xMm: 350, yMm: 500, widthMm: 50, heightMm: 50 },
      ],
      productInstances: [],
      segments: [],
      edges: [],
    });
    expect(checkConstraintSatisfied({ ...base, constraintType: "ALIGN" }, misalignedCtx).satisfied).toBe(false);
  });

  it("MIN_MAX: satisfied inside the range, violated outside it", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [
        { id: "fx1", xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 },
        { id: "fx2", xMm: 300, yMm: 0, widthMm: 100, heightMm: 100 },
      ],
      productInstances: [],
      segments: [],
      edges: [],
    });
    const base = {
      axis: "X" as const,
      valueMm: null,
      targetAKind: "FIXTURE" as const,
      targetAFixtureId: "fx1",
      targetAProductInstanceId: null,
      targetAGeometryNodeId: null,
      targetAGeometryEdgeId: null,
      targetBKind: "FIXTURE" as const,
      targetBFixtureId: "fx2",
      targetBProductInstanceId: null,
      targetBGeometryNodeId: null,
      targetBGeometryEdgeId: null,
    };
    // gap is 300 -- inside [200, 400]
    expect(checkConstraintSatisfied({ ...base, constraintType: "MIN_MAX", minValueMm: 200, maxValueMm: 400 }, ctx).satisfied).toBe(true);
    // outside [0, 100]
    expect(checkConstraintSatisfied({ ...base, constraintType: "MIN_MAX", minValueMm: 0, maxValueMm: 100 }, ctx).satisfied).toBe(false);
  });

  it("EQUAL: compares dimension along the given axis (X -> widthMm)", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [
        { id: "fx1", xMm: 0, yMm: 0, widthMm: 300, heightMm: 100 },
        { id: "fx2", xMm: 500, yMm: 0, widthMm: 300, heightMm: 250 },
      ],
      productInstances: [],
      segments: [],
      edges: [],
    });
    const base = {
      axis: "X" as const,
      valueMm: null,
      minValueMm: null,
      maxValueMm: null,
      targetAKind: "FIXTURE" as const,
      targetAFixtureId: "fx1",
      targetAProductInstanceId: null,
      targetAGeometryNodeId: null,
      targetAGeometryEdgeId: null,
      targetBKind: "FIXTURE" as const,
      targetBFixtureId: "fx2",
      targetBProductInstanceId: null,
      targetBGeometryNodeId: null,
      targetBGeometryEdgeId: null,
    };
    expect(checkConstraintSatisfied({ ...base, constraintType: "EQUAL", axis: "X" }, ctx).satisfied).toBe(true);
    expect(checkConstraintSatisfied({ ...base, constraintType: "EQUAL", axis: "Y" }, ctx).satisfied).toBe(false);
  });

  it("CENTER: a Fixture centered within a WallSegment", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [{ id: "fx1", xMm: 900, yMm: 0, widthMm: 200, heightMm: 100 }], // center x = 1000
      productInstances: [],
      segments: [{ id: "seg1", lengthMm: 2000, heightMm: 2400 }], // center x = 1000
      edges: [],
    });
    const base = {
      axis: "X" as const,
      valueMm: null,
      minValueMm: null,
      maxValueMm: null,
      targetAKind: "FIXTURE" as const,
      targetAFixtureId: "fx1",
      targetAProductInstanceId: null,
      targetAGeometryNodeId: null,
      targetAGeometryEdgeId: null,
      targetBKind: "GEOMETRY_NODE" as const,
      targetBFixtureId: null,
      targetBProductInstanceId: null,
      targetBGeometryNodeId: "seg1",
      targetBGeometryEdgeId: null,
    };
    expect(checkConstraintSatisfied({ ...base, constraintType: "CENTER" }, ctx).satisfied).toBe(true);

    const offCenterCtx = buildConstraintResolutionContext({
      fixtures: [{ id: "fx1", xMm: 100, yMm: 0, widthMm: 200, heightMm: 100 }], // center x = 200
      productInstances: [],
      segments: [{ id: "seg1", lengthMm: 2000, heightMm: 2400 }],
      edges: [],
    });
    expect(checkConstraintSatisfied({ ...base, constraintType: "CENTER" }, offCenterCtx).satisfied).toBe(false);
  });

  it("EDGE_TO_EDGE: gap between two spans matches valueMm", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [
        { id: "fx1", xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 }, // span [0,100]
        { id: "fx2", xMm: 200, yMm: 0, widthMm: 100, heightMm: 100 }, // span [200,300]
      ],
      productInstances: [],
      segments: [],
      edges: [],
    });
    const base = {
      axis: "X" as const,
      minValueMm: null,
      maxValueMm: null,
      targetAKind: "FIXTURE" as const,
      targetAFixtureId: "fx1",
      targetAProductInstanceId: null,
      targetAGeometryNodeId: null,
      targetAGeometryEdgeId: null,
      targetBKind: "FIXTURE" as const,
      targetBFixtureId: "fx2",
      targetBProductInstanceId: null,
      targetBGeometryNodeId: null,
      targetBGeometryEdgeId: null,
    };
    // gap between the two spans is 100 (200 - 100)
    expect(checkConstraintSatisfied({ ...base, constraintType: "EDGE_TO_EDGE", valueMm: 100 }, ctx).satisfied).toBe(true);
    expect(checkConstraintSatisfied({ ...base, constraintType: "EDGE_TO_EDGE", valueMm: 999 }, ctx).satisfied).toBe(false);
  });

  it("FIXED_POSITION: satisfied only when the target's own axis coordinate equals valueMm", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [{ id: "fx1", xMm: 150, yMm: 250, widthMm: 100, heightMm: 100 }],
      productInstances: [],
      segments: [],
      edges: [],
    });
    const base = {
      minValueMm: null,
      maxValueMm: null,
      targetAKind: "FIXTURE" as const,
      targetAFixtureId: "fx1",
      targetAProductInstanceId: null,
      targetAGeometryNodeId: null,
      targetAGeometryEdgeId: null,
      targetBKind: null,
      targetBFixtureId: null,
      targetBProductInstanceId: null,
      targetBGeometryNodeId: null,
      targetBGeometryEdgeId: null,
    };
    expect(checkConstraintSatisfied({ ...base, constraintType: "FIXED_POSITION", axis: "X", valueMm: 150 }, ctx).satisfied).toBe(true);
    expect(checkConstraintSatisfied({ ...base, constraintType: "FIXED_POSITION", axis: "Y", valueMm: 250 }, ctx).satisfied).toBe(true);
    expect(checkConstraintSatisfied({ ...base, constraintType: "FIXED_POSITION", axis: "X", valueMm: 999 }, ctx).satisfied).toBe(false);
  });

  it("an unresolvable endpoint (missing footprint) is a violation, not silently skipped", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [{ id: "fx1", xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 }],
      // No sizeOption -- footprint resolves to null, so EQUAL can't compare dimensions.
      productInstances: [
        { id: "pi1", x: 500, y: 0, sku: { category: { key: "FURNITURE" } }, sizeOption: null },
      ],
      segments: [],
      edges: [],
    });
    const result = checkConstraintSatisfied(
      {
        constraintType: "EQUAL",
        axis: "X",
        valueMm: null,
        minValueMm: null,
        maxValueMm: null,
        targetAKind: "FIXTURE",
        targetAFixtureId: "fx1",
        targetAProductInstanceId: null,
        targetAGeometryNodeId: null,
        targetAGeometryEdgeId: null,
        targetBKind: "PRODUCT_INSTANCE",
        targetBFixtureId: null,
        targetBProductInstanceId: "pi1",
        targetBGeometryNodeId: null,
        targetBGeometryEdgeId: null,
      },
      ctx,
    );
    expect(result.satisfied).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("WALL anchor: GEOMETRY_NODE resolves to 0, GEOMETRY_EDGE RIGHT/BOTTOM resolve to lengthMm/heightMm", () => {
    const ctx = buildConstraintResolutionContext({
      fixtures: [{ id: "fx1", xMm: 2000, yMm: 2400, widthMm: 10, heightMm: 10 }],
      productInstances: [],
      segments: [{ id: "seg1", lengthMm: 2000, heightMm: 2400 }],
      edges: [
        { id: "edgeRight", nodeId: "seg1", edgeRole: "RIGHT" },
        { id: "edgeBottom", nodeId: "seg1", edgeRole: "BOTTOM" },
      ],
    });
    // DISTANCE from the segment's own origin (0) to fx1's X (2000) should be 2000.
    const distFromNode = checkConstraintSatisfied(
      {
        constraintType: "DISTANCE",
        axis: "X",
        valueMm: 2000,
        minValueMm: null,
        maxValueMm: null,
        targetAKind: "GEOMETRY_NODE",
        targetAFixtureId: null,
        targetAProductInstanceId: null,
        targetAGeometryNodeId: "seg1",
        targetAGeometryEdgeId: null,
        targetBKind: "FIXTURE",
        targetBFixtureId: "fx1",
        targetBProductInstanceId: null,
        targetBGeometryNodeId: null,
        targetBGeometryEdgeId: null,
      },
      ctx,
    );
    expect(distFromNode.satisfied).toBe(true);

    // ALIGN between the RIGHT edge (resolves to lengthMm=2000) and fx1's X (2000).
    const alignRight = checkConstraintSatisfied(
      {
        constraintType: "ALIGN",
        axis: "X",
        valueMm: null,
        minValueMm: null,
        maxValueMm: null,
        targetAKind: "GEOMETRY_EDGE",
        targetAFixtureId: null,
        targetAProductInstanceId: null,
        targetAGeometryNodeId: null,
        targetAGeometryEdgeId: "edgeRight",
        targetBKind: "FIXTURE",
        targetBFixtureId: "fx1",
        targetBProductInstanceId: null,
        targetBGeometryNodeId: null,
        targetBGeometryEdgeId: null,
      },
      ctx,
    );
    expect(alignRight.satisfied).toBe(true);

    // ALIGN between the BOTTOM edge (resolves to heightMm=2400) and fx1's Y (2400).
    const alignBottom = checkConstraintSatisfied(
      {
        constraintType: "ALIGN",
        axis: "Y",
        valueMm: null,
        minValueMm: null,
        maxValueMm: null,
        targetAKind: "GEOMETRY_EDGE",
        targetAFixtureId: null,
        targetAProductInstanceId: null,
        targetAGeometryNodeId: null,
        targetAGeometryEdgeId: "edgeBottom",
        targetBKind: "FIXTURE",
        targetBFixtureId: "fx1",
        targetBProductInstanceId: null,
        targetBGeometryNodeId: null,
        targetBGeometryEdgeId: null,
      },
      ctx,
    );
    expect(alignBottom.satisfied).toBe(true);
  });
});
