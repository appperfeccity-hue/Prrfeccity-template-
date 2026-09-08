/**
 * Pure zoom/pan transform math for the unified Design canvas, decoupled from
 * Konva/React so it's independently testable. Operates on "base px" (i.e.
 * world mm already multiplied by a fixed mm->px scale elsewhere, e.g. via
 * computeZoneLayout's mm output) -- this module only knows about the
 * interactive zoom/pan layered on top of that, never mm directly.
 */
export type Viewport = { scale: number; panX: number; panY: number };

export const DEFAULT_VIEWPORT: Viewport = { scale: 1, panX: 0, panY: 0 };
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  return Math.min(max, Math.max(min, scale));
}

/** Base-px point -> screen px, given the current viewport transform. */
export function worldToScreen(basePx: { x: number; y: number }, viewport: Viewport) {
  return {
    x: basePx.x * viewport.scale + viewport.panX,
    y: basePx.y * viewport.scale + viewport.panY,
  };
}

/** Screen px -> base-px point, the inverse of worldToScreen. */
export function screenToWorld(screenPx: { x: number; y: number }, viewport: Viewport) {
  return {
    x: (screenPx.x - viewport.panX) / viewport.scale,
    y: (screenPx.y - viewport.panY) / viewport.scale,
  };
}

/** Zoom in/out by `factor` (e.g. 1.1 or 1/1.1), keeping the base-px point
 * under `pointerScreenPx` fixed on screen -- the standard "zoom to cursor"
 * behavior for a wheel-zoom canvas. */
export function zoomAtPoint(
  viewport: Viewport,
  pointerScreenPx: { x: number; y: number },
  factor: number,
  min = MIN_SCALE,
  max = MAX_SCALE,
): Viewport {
  const newScale = clampScale(viewport.scale * factor, min, max);
  const worldPoint = screenToWorld(pointerScreenPx, viewport);
  return {
    scale: newScale,
    panX: pointerScreenPx.x - worldPoint.x * newScale,
    panY: pointerScreenPx.y - worldPoint.y * newScale,
  };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

/** Scale + center a content bounding box (in base px) inside a viewport
 * container (in screen px), for "Fit design" / "100%" controls. */
export function fitToContent(
  content: { width: number; height: number },
  container: { width: number; height: number },
  padding = 40,
  min = MIN_SCALE,
  max = MAX_SCALE,
): Viewport {
  if (content.width <= 0 || content.height <= 0) return DEFAULT_VIEWPORT;
  const availableW = Math.max(1, container.width - padding * 2);
  const availableH = Math.max(1, container.height - padding * 2);
  const scale = clampScale(Math.min(availableW / content.width, availableH / content.height), min, max);
  const panX = (container.width - content.width * scale) / 2;
  const panY = (container.height - content.height * scale) / 2;
  return { scale, panX, panY };
}

/** Viewport at 100% (scale=1), content top-left aligned with `padding` inset. */
export function actualSize(padding = 40): Viewport {
  return { scale: 1, panX: padding, panY: padding };
}
