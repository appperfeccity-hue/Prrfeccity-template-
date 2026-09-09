import { worldToScreen, screenToWorld, type Viewport } from "@/lib/canvas/viewport";
import { snapToGrid } from "@/lib/canvas/scale";

/**
 * Base mm->px scale at viewport.scale=1 (before the interactive zoom/pan
 * layer from viewport.ts is applied). Matches the SCALE constant the old
 * WallCanvas/ZoneCanvas each hardcoded independently, so the unified stage
 * renders at the same familiar size at 100% zoom.
 */
export const BASE_SCALE = 0.2;

export type MmPoint = { x: number; y: number };
export type PxPoint = { x: number; y: number };

export function mmToBasePx(mm: MmPoint): PxPoint {
  return { x: mm.x * BASE_SCALE, y: mm.y * BASE_SCALE };
}

export function basePxToMm(px: PxPoint): MmPoint {
  return { x: px.x / BASE_SCALE, y: px.y / BASE_SCALE };
}

export function mmLengthToBasePx(mm: number): number {
  return mm * BASE_SCALE;
}

export function basePxLengthToMm(px: number): number {
  return px / BASE_SCALE;
}

/** Real-world mm point -> screen px, composing the fixed mm->px base scale
 * with the interactive viewport (pan/zoom) transform. */
export function mmToScreen(mm: MmPoint, viewport: Viewport): PxPoint {
  return worldToScreen(mmToBasePx(mm), viewport);
}

/** Screen px -> real-world mm point, the inverse of mmToScreen. */
export function screenToMm(screen: PxPoint, viewport: Viewport): MmPoint {
  return basePxToMm(screenToWorld(screen, viewport));
}

export function snapMmPoint(mm: MmPoint, enabled: boolean): MmPoint {
  if (!enabled) return mm;
  return { x: snapToGrid(mm.x), y: snapToGrid(mm.y) };
}

/**
 * Screen pointer position (e.g. a Konva drag/drop event's stage-relative
 * coords) -> a real mm point, snapped to the grid when enabled. This is the
 * single place drag/drop and click-to-place handlers convert screen
 * coordinates into domain (mm) coordinates -- DesignStage never computes
 * geometry itself, it only calls this and then hands the result to the
 * existing domain mutations.
 */
export function resolvePointerMm(screen: PxPoint, viewport: Viewport, snapEnabled: boolean): MmPoint {
  return snapMmPoint(screenToMm(screen, viewport), snapEnabled);
}
