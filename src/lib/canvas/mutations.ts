/**
 * Pure builders for domain-mutation inputs, shared by both the canvas
 * interaction handlers (DesignStage/layers) and the Inspector -- the single
 * place that decides what a "resize panel to X" or "move furniture to Y"
 * mutation call looks like, so Inspector edits and canvas edits can never
 * diverge into competing logic. None of these call an API or touch React;
 * they only shape the { ...mutate-input, ...undo-input } pairs the existing
 * useUndoRedo().pushAction pattern already expects, and never include skuId
 * -- a placed instance's SKU identity is never part of a move/resize/
 * rotate/quantity edit.
 */

export type PanelOrientation = "VERTICAL" | "HORIZONTAL";

export type PanelResizeInput = { panelId: string; widthMm: number; previousWidthMm: number };
export function buildPanelResizeInput(panelId: string, requestedWidthMm: number, previousWidthMm: number): PanelResizeInput {
  return { panelId, widthMm: Math.max(1, Math.round(requestedWidthMm)), previousWidthMm };
}

export function toggleOrientation(current: PanelOrientation): PanelOrientation {
  return current === "VERTICAL" ? "HORIZONTAL" : "VERTICAL";
}

export type PanelRotateInput = { panelId: string; orientation: PanelOrientation; previousOrientation: PanelOrientation };
export function buildPanelRotateInput(panelId: string, orientation: PanelOrientation, previousOrientation: PanelOrientation): PanelRotateInput {
  return { panelId, orientation, previousOrientation };
}

export type InstanceMoveInput = { instanceId: string; x: number; y: number; previousX: number; previousY: number };
export function buildInstanceMoveInput(
  instanceId: string,
  xMm: number,
  yMm: number,
  previousX: number | null | undefined,
  previousY: number | null | undefined,
): InstanceMoveInput {
  return { instanceId, x: Math.round(xMm), y: Math.round(yMm), previousX: previousX ?? 0, previousY: previousY ?? 0 };
}

function normalizeRotationDeg(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

export type InstanceRotateInput = { instanceId: string; rotationDeg: number; previousRotationDeg: number };
export function buildInstanceRotateInput(
  instanceId: string,
  rotationDeg: number,
  previousRotationDeg: number | null | undefined,
): InstanceRotateInput {
  return { instanceId, rotationDeg: normalizeRotationDeg(rotationDeg), previousRotationDeg: previousRotationDeg ?? 0 };
}

export type InstanceQuantityInput = { instanceId: string; quantity: number; previousQuantity: number };
export function buildInstanceQuantityInput(
  instanceId: string,
  requestedQuantity: number,
  previousQuantity: number,
): InstanceQuantityInput {
  return { instanceId, quantity: Math.max(0.0001, requestedQuantity), previousQuantity };
}

// Catalogue-option change on an already-placed furniture instance (Design /
// Colour / Size). This is NOT a geometric resize -- it swaps which approved
// catalogue configuration the instance points at. Undefined fields are left
// out of the mutate/undo payload entirely (not overwritten to null), so
// changing only e.g. Size doesn't clobber an existing Design/Colour choice.
export type InstanceOptionIds = { designOptionId?: string; colourOptionId?: string; sizeOptionId?: string };
export type InstanceOptionsInput = { instanceId: string; next: InstanceOptionIds; previous: InstanceOptionIds };
export function buildInstanceOptionsInput(
  instanceId: string,
  next: InstanceOptionIds,
  previous: InstanceOptionIds,
): InstanceOptionsInput {
  return { instanceId, next, previous };
}

// One generic update path covers every Fixture field edit (label/width/
// height/clearance/position) -- deliberately simpler than furniture's
// several separate per-field mutations, since Fixture has far fewer
// distinct concerns (no rotation, no catalogue options, no quantity).
// Fields left out of `next` are omitted from the mutate/undo payload
// entirely, not overwritten to null.
export type FixtureFields = {
  label?: string | null;
  xMm?: number;
  yMm?: number;
  widthMm?: number;
  heightMm?: number;
  clearanceMm?: number;
};
export type FixtureUpdateInput = { fixtureId: string; next: FixtureFields; previous: FixtureFields };
export function buildFixtureUpdateInput(
  fixtureId: string,
  next: FixtureFields,
  previous: FixtureFields,
): FixtureUpdateInput {
  return { fixtureId, next, previous };
}
