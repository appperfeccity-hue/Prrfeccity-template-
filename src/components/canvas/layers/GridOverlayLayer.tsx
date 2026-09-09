"use client";

import { Layer, Line } from "react-konva";
import { mmToBasePx, type MmPoint } from "@/lib/canvas/coords";

const GUIDE_EXTENT_PX = 20000;

/**
 * Topmost layer -- snap-guide crosshair shown while actively dragging a
 * shape, at the point it would snap to. Only rendered during an active
 * drag (activeDragMm set by whichever layer is dragging, e.g.
 * FurnitureLayer's onDragMove), so it never obstructs static viewing.
 */
export function GridOverlayLayer({ snappedMm }: { snappedMm: MmPoint | null }) {
  if (!snappedMm) return null;
  const px = mmToBasePx(snappedMm);

  return (
    <Layer listening={false}>
      <Line
        points={[px.x, -GUIDE_EXTENT_PX, px.x, GUIDE_EXTENT_PX]}
        stroke="#2563eb"
        strokeWidth={1}
        dash={[4, 4]}
        opacity={0.6}
      />
      <Line
        points={[-GUIDE_EXTENT_PX, px.y, GUIDE_EXTENT_PX, px.y]}
        stroke="#2563eb"
        strokeWidth={1}
        dash={[4, 4]}
        opacity={0.6}
      />
    </Layer>
  );
}
