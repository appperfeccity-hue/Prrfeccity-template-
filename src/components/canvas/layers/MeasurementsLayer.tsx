"use client";

import { Layer, Line, Text } from "react-konva";
import { basePxLengthToMm } from "@/lib/canvas/coords";
import type { Viewport } from "@/lib/canvas/viewport";

const SCREEN_BAR_PX = 100;
const SCREEN_INSET_PX = 20;

/**
 * A fixed-on-screen scale indicator (e.g. "500 mm") bottom-left of the
 * canvas, sized/positioned to stay screen-constant regardless of zoom --
 * important since the app works in real mm and nesting math, so the
 * Designer needs an at-a-glance sense of scale at any zoom level.
 */
export function MeasurementsLayer({
  viewport,
  containerHeight,
}: {
  viewport: Viewport;
  containerHeight: number;
}) {
  const barWorldLengthPx = SCREEN_BAR_PX / viewport.scale;
  const mmLength = Math.max(1, Math.round(basePxLengthToMm(barWorldLengthPx)));

  const screenX = SCREEN_INSET_PX;
  const screenY = containerHeight - SCREEN_INSET_PX;
  const localX = (screenX - viewport.panX) / viewport.scale;
  const localY = (screenY - viewport.panY) / viewport.scale;

  return (
    <Layer listening={false}>
      <Line
        points={[localX, localY, localX + barWorldLengthPx, localY]}
        stroke="#333"
        strokeWidth={2 / viewport.scale}
      />
      <Text
        text={`${mmLength} mm`}
        x={localX}
        y={localY - 16 / viewport.scale}
        fontSize={11 / viewport.scale}
        fill="#333"
      />
    </Layer>
  );
}
