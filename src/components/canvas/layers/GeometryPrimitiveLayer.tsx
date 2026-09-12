"use client";

import { Layer, Line } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import { mmToBasePx } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

/**
 * Phase 6 item 1: Generalized Geometry System -- renders GeometryPrimitiveLine
 * rows. The first real use of Konva Line for a geometry body anywhere in this
 * app (every other Line/Circle usage today is for edge markers, grid lines,
 * or constraint indicators). LINE is the only primitive kind with a domain
 * function/renderer this pass -- RECTANGLE/POLYLINE/ARC/CIRCLE stay
 * schema-only, so design.geometryNodes never carries rows for those kinds.
 *
 * Unlike Fixture/ProductInstance, a GeometryPrimitiveLine has no
 * wallSegmentId -- it isn't scoped to the active segment, so every line
 * renders regardless of which segment tab is active.
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

  const lines = design.geometryNodes.filter(
    (n) => n.nodeType === "PRIMITIVE" && n.primitiveKind === "LINE" && n.primitiveLine,
  );

  return (
    <Layer>
      {lines.map((n) => {
        const line = n.primitiveLine!;
        const selected = selectedId === line.id;
        const start = mmToBasePx({ x: line.startXMm, y: line.startYMm });
        const end = mmToBasePx({ x: line.endXMm, y: line.endYMm });
        return (
          <Line
            key={line.id}
            points={[start.x, start.y, end.x, end.y]}
            stroke={selected ? "#1e293b" : "#64748b"}
            strokeWidth={selected ? 3 : 2}
            hitStrokeWidth={12}
            onClick={(e) => {
              e.cancelBubble = true;
              onSelect?.(line.id);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onSelect?.(line.id);
            }}
          />
        );
      })}
    </Layer>
  );
}
