"use client";

import { Layer, Line } from "react-konva";
import { GRID_SNAP_MM } from "@/lib/canvas/scale";
import { mmLengthToBasePx } from "@/lib/canvas/coords";

/**
 * Background grid at GRID_SNAP_MM spacing, drawn in world (base px) space so
 * it pans/zooms with everything else. Non-interactive.
 */
export function GridLayer({ widthMm, heightMm }: { widthMm: number; heightMm: number }) {
  const stepPx = mmLengthToBasePx(GRID_SNAP_MM);
  const widthPx = mmLengthToBasePx(widthMm);
  const heightPx = mmLengthToBasePx(heightMm);
  if (stepPx <= 0 || widthPx <= 0 || heightPx <= 0) return null;

  const vLines: number[] = [];
  for (let x = 0; x <= widthPx + stepPx; x += stepPx) vLines.push(x);
  const hLines: number[] = [];
  for (let y = 0; y <= heightPx + stepPx; y += stepPx) hLines.push(y);

  return (
    <Layer listening={false}>
      {vLines.map((x) => (
        <Line key={`v${x}`} points={[x, -stepPx, x, heightPx + stepPx]} stroke="#e5e7eb" strokeWidth={1} />
      ))}
      {hLines.map((y) => (
        <Line key={`h${y}`} points={[-stepPx, y, widthPx + stepPx, y]} stroke="#e5e7eb" strokeWidth={1} />
      ))}
    </Layer>
  );
}
