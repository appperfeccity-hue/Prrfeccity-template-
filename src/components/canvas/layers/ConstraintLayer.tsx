"use client";

import { Fragment } from "react";
import { Layer, Line, Circle, Text } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import type { ValidationIssue } from "@/lib/types";
import { mmToBasePx } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

type Constraint = FullDesign["constraints"][number];

/**
 * A thin dashed connector (or a single marker for FIXED_POSITION) between a
 * Constraint's target(s) -- see src/lib/graph/constraint.ts. Genuinely new:
 * no existing canvas layer reads validation issues today, so color reflects
 * only the LAST PERSISTED "Run Validation" click (design.validationResults[0]),
 * not a live per-render recompute -- there is no live-recompute-inside-canvas
 * precedent anywhere in this app to build on.
 *
 * Only renders a constraint when every one of its present endpoints
 * resolves onto the active segment (or is unscoped, e.g. a freestanding
 * Fixture/ProductInstance with no wallSegmentId) -- mirrors the same
 * "unscoped bucket" convention validation rule 18 (FIXTURE_CLEARANCE_OVERLAP)
 * already uses, and matches this component's own "flat per-segment
 * elevation, no bent rendering" scope.
 */
export function ConstraintLayer({
  constraints,
  design,
  activeSegmentId,
  selection,
  onSelect,
}: {
  constraints: Constraint[];
  design: FullDesign;
  activeSegmentId: string;
  selection: CanvasSelection;
  onSelect?: (id: string) => void;
}) {
  const selectedId = selection?.kind === "constraint" ? selection.id : null;

  const segmentById = new Map(
    design.geometryNodes.filter((n) => n.nodeType === "WALL" && n.wallSegment).map((n) => [n.id, n.wallSegment!]),
  );
  const edgeById = new Map(design.geometryNodes.flatMap((n) => n.edges.map((e) => [e.id, e])));
  const fixtureById = new Map(design.fixtures.map((f) => [f.id, f]));
  const instanceById = new Map(design.productInstances.map((i) => [i.id, i]));

  const latestIssues = ((design.validationResults[0]?.issues as unknown as ValidationIssue[]) ?? []).filter(
    (i) => i.code === "CONSTRAINT_SATISFIED",
  );
  const violatedConstraintIds = new Set(latestIssues.map((i) => i.refId).filter((id): id is string => !!id));

  // Segment membership + anchor-point resolution for one endpoint. Returns
  // null when the endpoint belongs to a different (non-active) segment, or
  // when it can't be resolved at all (e.g. a stale/deleted row) -- either
  // way the whole constraint is skipped for this render, not drawn wrong.
  const resolveEndpoint = (
    kind: string | null,
    fixtureId: string | null,
    productInstanceId: string | null,
    geometryNodeId: string | null,
    geometryEdgeId: string | null,
  ): { x: number; y: number } | null => {
    if (kind === "FIXTURE") {
      const fx = fixtureId ? fixtureById.get(fixtureId) : null;
      if (!fx) return null;
      if (fx.wallSegmentId != null && fx.wallSegmentId !== activeSegmentId) return null;
      return { x: fx.xMm + fx.widthMm / 2, y: fx.yMm + fx.heightMm / 2 };
    }
    if (kind === "PRODUCT_INSTANCE") {
      const inst = productInstanceId ? instanceById.get(productInstanceId) : null;
      if (!inst || inst.x == null || inst.y == null) return null;
      if (inst.wallSegmentId != null && inst.wallSegmentId !== activeSegmentId) return null;
      return { x: inst.x, y: inst.y };
    }
    if (kind === "GEOMETRY_NODE") {
      if (!geometryNodeId || geometryNodeId !== activeSegmentId) return null;
      return { x: 0, y: 0 };
    }
    if (kind === "GEOMETRY_EDGE") {
      const edge = geometryEdgeId ? edgeById.get(geometryEdgeId) : null;
      if (!edge || edge.nodeId !== activeSegmentId) return null;
      const segment = segmentById.get(edge.nodeId);
      if (!segment) return null;
      if (edge.edgeRole === "LEFT") return { x: 0, y: segment.heightMm / 2 };
      if (edge.edgeRole === "RIGHT") return { x: segment.lengthMm, y: segment.heightMm / 2 };
      if (edge.edgeRole === "TOP") return { x: segment.lengthMm / 2, y: 0 };
      if (edge.edgeRole === "BOTTOM") return { x: segment.lengthMm / 2, y: segment.heightMm };
      return null;
    }
    return null;
  };

  return (
    <Layer>
      {constraints.flatMap((c) => {
        const a = resolveEndpoint(c.targetAKind, c.targetAFixtureId, c.targetAProductInstanceId, c.targetAGeometryNodeId, c.targetAGeometryEdgeId);
        if (!a) return [];
        const violated = violatedConstraintIds.has(c.id);
        const color = violated ? "#dc2626" : "#16a34a";
        const selected = selectedId === c.id;
        const aPx = mmToBasePx(a);

        if (c.constraintType === "FIXED_POSITION") {
          return [
            <Fragment key={c.id}>
              <Circle
                x={aPx.x}
                y={aPx.y}
                radius={selected ? 7 : 5}
                fill={color}
                stroke={selected ? "#1e293b" : undefined}
                strokeWidth={selected ? 2 : 0}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect?.(c.id);
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  onSelect?.(c.id);
                }}
              />
              <Text text="FIXED" x={aPx.x + 8} y={aPx.y - 6} fontSize={10} fill={color} listening={false} />
            </Fragment>,
          ];
        }

        const b = resolveEndpoint(c.targetBKind, c.targetBFixtureId, c.targetBProductInstanceId, c.targetBGeometryNodeId, c.targetBGeometryEdgeId);
        if (!b) return [];
        const bPx = mmToBasePx(b);
        const midX = (aPx.x + bPx.x) / 2;
        const midY = (aPx.y + bPx.y) / 2;

        return [
          <Fragment key={c.id}>
            <Line
              points={[aPx.x, aPx.y, bPx.x, bPx.y]}
              stroke={color}
              strokeWidth={selected ? 2.5 : 1.5}
              dash={[6, 4]}
              hitStrokeWidth={12}
              onClick={(e) => {
                e.cancelBubble = true;
                onSelect?.(c.id);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                onSelect?.(c.id);
              }}
            />
            <Text text={c.constraintType} x={midX + 4} y={midY - 12} fontSize={10} fill={color} listening={false} />
          </Fragment>,
        ];
      })}
    </Layer>
  );
}
