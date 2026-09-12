"use client";

import type { KonvaEventObject } from "konva/lib/Node";
import { Arc, Circle, Layer, Line, Rect } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import { mmLengthToBasePx, mmToBasePx } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

/**
 * Generalized Geometry System (Phase 6 items 1-2) -- renders every
 * GeometryPrimitiveKind. LINE was the original reference implementation
 * (the first real use of Konva Line for a geometry body anywhere in this
 * app, as opposed to edge markers/grid lines/constraint indicators);
 * RECTANGLE/POLYLINE/ARC/CIRCLE extend it the same way. This is the first
 * use of Konva's Arc/Rect/Circle shapes for a primitive's own body (Rect/
 * Circle are otherwise only used for zones/panels/fixtures/constraint
 * markers, never a freestanding primitive; Arc is a first use anywhere).
 *
 * None of the 5 kinds have a wallSegmentId -- none are scoped to the active
 * segment, so every primitive renders regardless of which segment tab is
 * active. All 5 share one un-fillable outline styling convention (no
 * `fill`, stroke-only) -- clicking a large RECTANGLE/CIRCLE/POLYLINE's
 * interior won't select it, only its border, matching LINE's own
 * un-fillable nature.
 */
export function GeometryPrimitiveLayer({
  design,
  selection,
  onSelect,
}: {
  design: FullDesign;
  selection: CanvasSelection;
  onSelect?: (id: string) => void;
}) {
  const selectedId = selection?.kind === "primitive" ? selection.id : null;
  const strokeFor = (selected: boolean) => (selected ? "#1e293b" : "#64748b");

  const nodes = design.geometryNodes.filter((n) => n.nodeType === "PRIMITIVE");

  return (
    <Layer>
      {nodes.map((n) => {
        const selected = selectedId === n.id;
        const stroke = strokeFor(selected);
        const strokeWidth = selected ? 3 : 2;
        const handlers = {
          onClick: (e: KonvaEventObject<MouseEvent>) => {
            e.cancelBubble = true;
            onSelect?.(n.id);
          },
          onTap: (e: KonvaEventObject<Event>) => {
            e.cancelBubble = true;
            onSelect?.(n.id);
          },
        };

        if (n.primitiveKind === "LINE" && n.primitiveLine) {
          const line = n.primitiveLine;
          const start = mmToBasePx({ x: line.startXMm, y: line.startYMm });
          const end = mmToBasePx({ x: line.endXMm, y: line.endYMm });
          return (
            <Line
              key={n.id}
              points={[start.x, start.y, end.x, end.y]}
              stroke={stroke}
              strokeWidth={strokeWidth}
              hitStrokeWidth={12}
              {...handlers}
            />
          );
        }

        if (n.primitiveKind === "RECTANGLE" && n.primitiveRectangle) {
          const r = n.primitiveRectangle;
          const topLeft = mmToBasePx({ x: r.xMm, y: r.yMm });
          return (
            <Rect
              key={n.id}
              x={topLeft.x}
              y={topLeft.y}
              width={mmLengthToBasePx(r.widthMm)}
              height={mmLengthToBasePx(r.heightMm)}
              rotation={r.rotationDeg}
              stroke={stroke}
              strokeWidth={strokeWidth}
              hitStrokeWidth={12}
              {...handlers}
            />
          );
        }

        if (n.primitiveKind === "POLYLINE" && n.primitivePolyline) {
          const poly = n.primitivePolyline;
          // bulge is real stored data with zero rendering effect this pass
          // (straight segments only) -- a deferred enhancement, mirroring
          // this codebase's own WallJunction.angleDeg precedent.
          const points = poly.points
            .slice()
            .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
            .flatMap((pt) => {
              const p = mmToBasePx({ x: pt.xMm, y: pt.yMm });
              return [p.x, p.y];
            });
          return (
            <Line
              key={n.id}
              points={points}
              closed={poly.closed}
              stroke={stroke}
              strokeWidth={strokeWidth}
              hitStrokeWidth={12}
              {...handlers}
            />
          );
        }

        if (n.primitiveKind === "ARC" && n.primitiveArc) {
          const a = n.primitiveArc;
          const center = mmToBasePx({ x: a.centerXMm, y: a.centerYMm });
          const radiusPx = mmLengthToBasePx(a.radiusMm);
          return (
            <Arc
              key={n.id}
              x={center.x}
              y={center.y}
              innerRadius={radiusPx}
              outerRadius={radiusPx}
              angle={a.sweepAngleDeg}
              rotation={a.startAngleDeg}
              stroke={stroke}
              strokeWidth={strokeWidth}
              hitStrokeWidth={12}
              {...handlers}
            />
          );
        }

        if (n.primitiveKind === "CIRCLE" && n.primitiveCircle) {
          const c = n.primitiveCircle;
          const center = mmToBasePx({ x: c.centerXMm, y: c.centerYMm });
          return (
            <Circle
              key={n.id}
              x={center.x}
              y={center.y}
              radius={mmLengthToBasePx(c.radiusMm)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              hitStrokeWidth={12}
              {...handlers}
            />
          );
        }

        return null;
      })}
    </Layer>
  );
}
