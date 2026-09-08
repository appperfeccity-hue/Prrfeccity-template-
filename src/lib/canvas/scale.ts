export const GRID_SNAP_MM = 100;

export function snapToGrid(value: number, gridMm = GRID_SNAP_MM) {
  return Math.round(value / gridMm) * gridMm;
}
