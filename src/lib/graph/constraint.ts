import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api/errors";
import { WIDTH_TOLERANCE_MM } from "@/lib/graph/constants";
import type { Constraint, ConstraintAxis, ConstraintTargetKind, ConstraintType } from "@/generated/prisma/client";

export type ConstraintTargetRef = { kind: ConstraintTargetKind; id: string };

const FREESTANDING: ConstraintTargetKind[] = ["FIXTURE", "PRODUCT_INSTANCE"];
const ANCHOR: ConstraintTargetKind[] = ["GEOMETRY_NODE", "GEOMETRY_EDGE"];
const WALL_EDGE_ROLES_BY_AXIS: Record<ConstraintAxis, string[]> = { X: ["LEFT", "RIGHT"], Y: ["TOP", "BOTTOM"] };

// The pairing table depends on axis/edgeRole compatibility, which needs a DB
// read -- deliberately NOT expressed as a zod .refine() (schema validation
// alone can't reach it). Matches this codebase's existing "zod catches
// shape, the domain function catches semantics" split (e.g.
// createWallSegment's own "second segment already exists" check).
function assertValidShape(type: ConstraintType, aKind: ConstraintTargetKind, bKind: ConstraintTargetKind | null) {
  if (type === "FIXED_POSITION") {
    if (bKind !== null) throw badRequest("FIXED_POSITION takes exactly one target");
    if (!FREESTANDING.includes(aKind)) throw badRequest("FIXED_POSITION's target must be a Fixture or ProductInstance");
    return;
  }
  if (bKind === null) throw badRequest(`${type} requires two targets`);
  if (ANCHOR.includes(aKind) && ANCHOR.includes(bKind)) {
    throw badRequest("At least one target must be a Fixture or ProductInstance");
  }
  if (type === "EQUAL" && (!FREESTANDING.includes(aKind) || !FREESTANDING.includes(bKind))) {
    throw badRequest("EQUAL is scoped to Fixture/ProductInstance pairs only this pass");
  }
  if (type === "CENTER") {
    if (!FREESTANDING.includes(aKind)) {
      throw badRequest("CENTER's first target (the thing being centered) must be a Fixture or ProductInstance");
    }
    if (bKind === "GEOMETRY_EDGE") {
      throw badRequest("CENTER's container must be a Fixture, ProductInstance, or wall segment -- not a specific edge");
    }
  }
  if (type === "EDGE_TO_EDGE" && (aKind === "GEOMETRY_NODE" || bKind === "GEOMETRY_NODE")) {
    throw badRequest("EDGE_TO_EDGE needs a specific edge, not a whole wall segment -- use a GeometryEdge target");
  }
}

async function assertWallAnchor(designId: string, ref: ConstraintTargetRef, axis: ConstraintAxis) {
  if (ref.kind === "GEOMETRY_NODE") {
    const segment = await prisma.wallSegment.findUnique({ where: { id: ref.id } });
    if (!segment || segment.designId !== designId) {
      throw badRequest("GEOMETRY_NODE anchor must be a wall segment in this design");
    }
  }
  if (ref.kind === "GEOMETRY_EDGE") {
    const edge = await prisma.geometryEdge.findUnique({ where: { id: ref.id } });
    if (!edge || edge.designId !== designId) throw notFound(`GeometryEdge ${ref.id} not found in this design`);
    const segment = await prisma.wallSegment.findUnique({ where: { id: edge.nodeId } });
    if (!segment) throw badRequest("GEOMETRY_EDGE anchor must belong to a wall segment");
    if (!WALL_EDGE_ROLES_BY_AXIS[axis].includes(edge.edgeRole)) {
      throw badRequest(`A ${edge.edgeRole} edge has no meaningful ${axis} coordinate for this constraint's axis`);
    }
  }
}

async function assertBelongsToDesign(designId: string, ref: ConstraintTargetRef) {
  if (ref.kind === "FIXTURE") {
    const row = await prisma.fixture.findUnique({ where: { id: ref.id } });
    if (!row || row.designId !== designId) throw notFound(`Fixture ${ref.id} not found in this design`);
  } else if (ref.kind === "PRODUCT_INSTANCE") {
    const row = await prisma.productInstance.findUnique({ where: { id: ref.id } });
    if (!row || row.designId !== designId) throw notFound(`ProductInstance ${ref.id} not found in this design`);
  }
  // GEOMETRY_NODE/GEOMETRY_EDGE membership + wall-scoping is checked by assertWallAnchor.
}

function targetColumns(prefix: "A", ref: ConstraintTargetRef): {
  targetAKind: ConstraintTargetKind;
  targetAFixtureId: string | null;
  targetAProductInstanceId: string | null;
  targetAGeometryNodeId: string | null;
  targetAGeometryEdgeId: string | null;
};
function targetColumns(prefix: "B", ref: ConstraintTargetRef | null): {
  targetBKind: ConstraintTargetKind | null;
  targetBFixtureId: string | null;
  targetBProductInstanceId: string | null;
  targetBGeometryNodeId: string | null;
  targetBGeometryEdgeId: string | null;
};
function targetColumns(prefix: "A" | "B", ref: ConstraintTargetRef | null) {
  return {
    [`target${prefix}Kind`]: ref?.kind ?? null,
    [`target${prefix}FixtureId`]: ref?.kind === "FIXTURE" ? ref.id : null,
    [`target${prefix}ProductInstanceId`]: ref?.kind === "PRODUCT_INSTANCE" ? ref.id : null,
    [`target${prefix}GeometryNodeId`]: ref?.kind === "GEOMETRY_NODE" ? ref.id : null,
    [`target${prefix}GeometryEdgeId`]: ref?.kind === "GEOMETRY_EDGE" ? ref.id : null,
  };
}

export async function createConstraint(
  designId: string,
  input: {
    constraintType: ConstraintType;
    targetA: ConstraintTargetRef;
    targetB?: ConstraintTargetRef | null;
    axis: ConstraintAxis;
    valueMm?: number | null;
    minValueMm?: number | null;
    maxValueMm?: number | null;
  },
) {
  const targetB = input.targetB ?? null;
  assertValidShape(input.constraintType, input.targetA.kind, targetB?.kind ?? null);
  await assertBelongsToDesign(designId, input.targetA);
  await assertWallAnchor(designId, input.targetA, input.axis);
  if (targetB) {
    await assertBelongsToDesign(designId, targetB);
    await assertWallAnchor(designId, targetB, input.axis);
  }
  return prisma.constraint.create({
    data: {
      designId,
      constraintType: input.constraintType,
      axis: input.axis,
      valueMm: input.valueMm ?? null,
      minValueMm: input.minValueMm ?? null,
      maxValueMm: input.maxValueMm ?? null,
      ...targetColumns("A", input.targetA),
      ...targetColumns("B", targetB),
    },
  });
}

export async function deleteConstraint(constraintId: string) {
  await prisma.constraint.delete({ where: { id: constraintId } });
}

// ---------------------------------------------------------------------------
// Satisfaction checking -- consumed by validation rule 20
// (CONSTRAINT_SATISFIED, src/lib/graph/validation.ts). This is the ONLY
// code that ever reads a Constraint row's meaning; nothing here or anywhere
// else writes back to a Fixture's/ProductInstance's geometry -- "+ Solver"
// is out of scope this pass.
// ---------------------------------------------------------------------------

export type ConstraintResolutionContext = {
  fixtures: Map<string, { xMm: number; yMm: number; widthMm: number; heightMm: number }>;
  // footprint is null unless the instance is FURNITURE-category with a
  // resolved sizeOptionId -- same scoping as rule 18 (FIXTURE_CLEARANCE_OVERLAP).
  instances: Map<string, { x: number | null; y: number | null; footprint: { widthMm: number; heightMm: number } | null }>;
  segments: Map<string, { lengthMm: number; heightMm: number }>; // keyed by GeometryNode id (shared PK)
  edges: Map<string, { nodeId: string; edgeRole: string }>;
};

type Endpoint = { kind: ConstraintTargetKind; id: string };

export function resolveAxisPoint(t: Endpoint, axis: ConstraintAxis, ctx: ConstraintResolutionContext): number | null {
  if (t.kind === "FIXTURE") {
    const fx = ctx.fixtures.get(t.id);
    return fx ? (axis === "X" ? fx.xMm : fx.yMm) : null;
  }
  if (t.kind === "PRODUCT_INSTANCE") {
    const inst = ctx.instances.get(t.id);
    return inst ? (axis === "X" ? inst.x : inst.y) : null;
  }
  if (t.kind === "GEOMETRY_NODE") return 0; // the wall segment's own local-frame origin
  const edge = ctx.edges.get(t.id);
  if (!edge) return null;
  const seg = ctx.segments.get(edge.nodeId);
  if (!seg) return null;
  if (edge.edgeRole === "LEFT" || edge.edgeRole === "TOP") return 0;
  if (edge.edgeRole === "RIGHT") return seg.lengthMm;
  if (edge.edgeRole === "BOTTOM") return seg.heightMm;
  return null;
}

export function resolveSpan(t: Endpoint, axis: ConstraintAxis, ctx: ConstraintResolutionContext): [number, number] | null {
  if (t.kind === "FIXTURE") {
    const fx = ctx.fixtures.get(t.id);
    if (!fx) return null;
    return axis === "X" ? [fx.xMm, fx.xMm + fx.widthMm] : [fx.yMm, fx.yMm + fx.heightMm];
  }
  if (t.kind === "PRODUCT_INSTANCE") {
    const inst = ctx.instances.get(t.id);
    if (!inst || inst.x == null || inst.y == null || !inst.footprint) return null;
    const center = axis === "X" ? inst.x : inst.y;
    const half = (axis === "X" ? inst.footprint.widthMm : inst.footprint.heightMm) / 2;
    return [center - half, center + half];
  }
  if (t.kind === "GEOMETRY_EDGE") {
    const v = resolveAxisPoint(t, axis, ctx);
    return v == null ? null : [v, v];
  }
  return null; // GEOMETRY_NODE excluded from EDGE_TO_EDGE by assertValidShape
}

export function resolveCenter(t: Endpoint, axis: ConstraintAxis, ctx: ConstraintResolutionContext): number | null {
  if (t.kind === "FIXTURE") {
    const fx = ctx.fixtures.get(t.id);
    return fx ? (axis === "X" ? fx.xMm + fx.widthMm / 2 : fx.yMm + fx.heightMm / 2) : null;
  }
  if (t.kind === "PRODUCT_INSTANCE") {
    const inst = ctx.instances.get(t.id);
    return inst ? (axis === "X" ? inst.x : inst.y) : null;
  }
  if (t.kind === "GEOMETRY_NODE") {
    const seg = ctx.segments.get(t.id);
    return seg ? (axis === "X" ? seg.lengthMm / 2 : seg.heightMm / 2) : null;
  }
  return null;
}

export function resolveDimension(t: Endpoint, axis: ConstraintAxis, ctx: ConstraintResolutionContext): number | null {
  if (t.kind === "FIXTURE") {
    const fx = ctx.fixtures.get(t.id);
    return fx ? (axis === "X" ? fx.widthMm : fx.heightMm) : null;
  }
  if (t.kind === "PRODUCT_INSTANCE") {
    const inst = ctx.instances.get(t.id);
    return inst?.footprint ? (axis === "X" ? inst.footprint.widthMm : inst.footprint.heightMm) : null;
  }
  return null;
}

function endpoint(kind: ConstraintTargetKind | null, id: string | null): Endpoint | null {
  return kind && id ? { kind, id } : null;
}

export function checkConstraintSatisfied(
  c: Pick<
    Constraint,
    | "constraintType"
    | "axis"
    | "valueMm"
    | "minValueMm"
    | "maxValueMm"
    | "targetAKind"
    | "targetAFixtureId"
    | "targetAProductInstanceId"
    | "targetAGeometryNodeId"
    | "targetAGeometryEdgeId"
    | "targetBKind"
    | "targetBFixtureId"
    | "targetBProductInstanceId"
    | "targetBGeometryNodeId"
    | "targetBGeometryEdgeId"
  >,
  ctx: ConstraintResolutionContext,
): { satisfied: boolean; reason?: string } {
  const a = endpoint(
    c.targetAKind,
    c.targetAFixtureId ?? c.targetAProductInstanceId ?? c.targetAGeometryNodeId ?? c.targetAGeometryEdgeId,
  )!;
  const b = endpoint(
    c.targetBKind,
    c.targetBFixtureId ?? c.targetBProductInstanceId ?? c.targetBGeometryNodeId ?? c.targetBGeometryEdgeId,
  );
  const unresolvable = { satisfied: false, reason: "Cannot evaluate: a target has no resolvable geometry" };

  switch (c.constraintType) {
    case "FIXED_POSITION": {
      const av = resolveAxisPoint(a, c.axis, ctx);
      if (av == null) return unresolvable;
      return { satisfied: Math.abs(av - c.valueMm!) <= WIDTH_TOLERANCE_MM };
    }
    case "DISTANCE": {
      const av = resolveAxisPoint(a, c.axis, ctx);
      const bv = resolveAxisPoint(b!, c.axis, ctx);
      if (av == null || bv == null) return unresolvable;
      return { satisfied: Math.abs(Math.abs(av - bv) - c.valueMm!) <= WIDTH_TOLERANCE_MM };
    }
    case "ALIGN": {
      const av = resolveAxisPoint(a, c.axis, ctx);
      const bv = resolveAxisPoint(b!, c.axis, ctx);
      if (av == null || bv == null) return unresolvable;
      return { satisfied: Math.abs(av - bv) <= WIDTH_TOLERANCE_MM };
    }
    case "MIN_MAX": {
      const av = resolveAxisPoint(a, c.axis, ctx);
      const bv = resolveAxisPoint(b!, c.axis, ctx);
      if (av == null || bv == null) return unresolvable;
      const dist = Math.abs(av - bv);
      return { satisfied: dist >= c.minValueMm! - WIDTH_TOLERANCE_MM && dist <= c.maxValueMm! + WIDTH_TOLERANCE_MM };
    }
    case "EQUAL": {
      const av = resolveDimension(a, c.axis, ctx);
      const bv = resolveDimension(b!, c.axis, ctx);
      if (av == null || bv == null) return unresolvable;
      return { satisfied: Math.abs(av - bv) <= WIDTH_TOLERANCE_MM };
    }
    case "CENTER": {
      const av = resolveCenter(a, c.axis, ctx);
      const bv = resolveCenter(b!, c.axis, ctx);
      if (av == null || bv == null) return unresolvable;
      return { satisfied: Math.abs(av - bv) <= WIDTH_TOLERANCE_MM };
    }
    case "EDGE_TO_EDGE": {
      const spanA = resolveSpan(a, c.axis, ctx);
      const spanB = resolveSpan(b!, c.axis, ctx);
      if (!spanA || !spanB) return unresolvable;
      const gap = Math.max(spanB[0] - spanA[1], spanA[0] - spanB[1]);
      return { satisfied: Math.abs(gap - c.valueMm!) <= WIDTH_TOLERANCE_MM };
    }
  }
}

export function buildConstraintResolutionContext(rows: {
  fixtures: { id: string; xMm: number; yMm: number; widthMm: number; heightMm: number }[];
  productInstances: {
    id: string;
    x: number | null;
    y: number | null;
    sku: { category: { key: string } };
    sizeOption: { widthMm: number; heightMm: number } | null;
  }[];
  segments: { id: string; lengthMm: number; heightMm: number }[];
  edges: { id: string; nodeId: string; edgeRole: string }[];
}): ConstraintResolutionContext {
  return {
    fixtures: new Map(rows.fixtures.map((f) => [f.id, f])),
    instances: new Map(
      rows.productInstances.map((i) => [
        i.id,
        { x: i.x, y: i.y, footprint: i.sku.category.key === "FURNITURE" && i.sizeOption ? i.sizeOption : null },
      ]),
    ),
    segments: new Map(rows.segments.map((s) => [s.id, s])),
    edges: new Map(rows.edges.map((e) => [e.id, e])),
  };
}
