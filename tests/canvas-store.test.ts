import { describe, expect, it } from "vitest";
import { canvasReducer, initialCanvasState, type CanvasSelectionItem } from "@/lib/canvas/store-reducer";

const panel1: CanvasSelectionItem = { kind: "panel", id: "panel-1" };
const panel2: CanvasSelectionItem = { kind: "panel", id: "panel-2" };
const instance1: CanvasSelectionItem = { kind: "instance", id: "inst-1" };
const fixture1: CanvasSelectionItem = { kind: "fixture", id: "fixture-1" };
const constraint1: CanvasSelectionItem = { kind: "constraint", id: "constraint-1" };
const primitive1: CanvasSelectionItem = { kind: "primitive", id: "primitive-1" };

describe("canvasReducer selection", () => {
  it("select() replaces the selection with a single item", () => {
    const state = canvasReducer(initialCanvasState, { type: "select", selection: panel1 });
    expect(state.selectedItems).toEqual([panel1]);
  });

  it("select(null) clears the selection", () => {
    const withSelection = canvasReducer(initialCanvasState, { type: "select", selection: panel1 });
    const cleared = canvasReducer(withSelection, { type: "select", selection: null });
    expect(cleared.selectedItems).toEqual([]);
  });

  it("clearSelection empties selectedItems entirely, including a multi-select set", () => {
    const withMulti = canvasReducer(initialCanvasState, { type: "selectMultiple", items: [panel1, panel2, instance1] });
    expect(withMulti.selectedItems).toHaveLength(3);
    const cleared = canvasReducer(withMulti, { type: "clearSelection" });
    expect(cleared.selectedItems).toEqual([]);
  });

  it("addToSelection appends without duplicating an already-selected item", () => {
    let state = canvasReducer(initialCanvasState, { type: "addToSelection", item: panel1 });
    state = canvasReducer(state, { type: "addToSelection", item: panel2 });
    state = canvasReducer(state, { type: "addToSelection", item: panel1 }); // duplicate
    expect(state.selectedItems).toEqual([panel1, panel2]);
  });

  it("toggleInSelection adds an unselected item and removes a selected one", () => {
    let state = canvasReducer(initialCanvasState, { type: "toggleInSelection", item: panel1 });
    expect(state.selectedItems).toEqual([panel1]);
    state = canvasReducer(state, { type: "toggleInSelection", item: panel1 });
    expect(state.selectedItems).toEqual([]);
  });

  it("selectMultiple sets the full selection set directly", () => {
    const state = canvasReducer(initialCanvasState, { type: "selectMultiple", items: [panel1, instance1] });
    expect(state.selectedItems).toEqual([panel1, instance1]);
  });

  it("a 'fixture' selection kind behaves identically to every other kind -- the reducer needed no changes beyond the type union", () => {
    let state = canvasReducer(initialCanvasState, { type: "select", selection: fixture1 });
    expect(state.selectedItems).toEqual([fixture1]);
    state = canvasReducer(state, { type: "toggleInSelection", item: fixture1 });
    expect(state.selectedItems).toEqual([]);
    state = canvasReducer(state, { type: "addToSelection", item: fixture1 });
    expect(state.selectedItems).toEqual([fixture1]);
    state = canvasReducer(state, { type: "clearSelection" });
    expect(state.selectedItems).toEqual([]);
  });

  it("a 'constraint' selection kind behaves identically to every other kind -- the reducer needed no changes beyond the type union", () => {
    let state = canvasReducer(initialCanvasState, { type: "select", selection: constraint1 });
    expect(state.selectedItems).toEqual([constraint1]);
    state = canvasReducer(state, { type: "toggleInSelection", item: constraint1 });
    expect(state.selectedItems).toEqual([]);
    state = canvasReducer(state, { type: "addToSelection", item: constraint1 });
    expect(state.selectedItems).toEqual([constraint1]);
    state = canvasReducer(state, { type: "clearSelection" });
    expect(state.selectedItems).toEqual([]);
  });

  it("a 'primitive' selection kind behaves identically to every other kind -- the reducer needed no changes beyond the type union", () => {
    let state = canvasReducer(initialCanvasState, { type: "select", selection: primitive1 });
    expect(state.selectedItems).toEqual([primitive1]);
    state = canvasReducer(state, { type: "toggleInSelection", item: primitive1 });
    expect(state.selectedItems).toEqual([]);
    state = canvasReducer(state, { type: "addToSelection", item: primitive1 });
    expect(state.selectedItems).toEqual([primitive1]);
    state = canvasReducer(state, { type: "clearSelection" });
    expect(state.selectedItems).toEqual([]);
  });
});

describe("canvasReducer tool switching clears selection (Escape uses the same clearSelection path)", () => {
  it("switching to a non-select tool clears any existing selection", () => {
    const withSelection = canvasReducer(initialCanvasState, { type: "select", selection: panel1 });
    const afterToolSwitch = canvasReducer(withSelection, { type: "setTool", tool: "add-zone" });
    expect(afterToolSwitch.selectedItems).toEqual([]);
    expect(afterToolSwitch.activeTool).toBe("add-zone");
  });

  it("switching back to select does not resurrect a prior selection", () => {
    const withSelection = canvasReducer(initialCanvasState, { type: "select", selection: panel1 });
    const panning = canvasReducer(withSelection, { type: "setTool", tool: "pan" });
    const backToSelect = canvasReducer(panning, { type: "setTool", tool: "select" });
    expect(backToSelect.selectedItems).toEqual([]);
  });

  it("Escape's effective sequence (setTool select + clearSelection) leaves no selection regardless of prior state", () => {
    const withMulti = canvasReducer(initialCanvasState, { type: "selectMultiple", items: [panel1, panel2] });
    const afterSetTool = canvasReducer(withMulti, { type: "setTool", tool: "select" });
    const afterClear = canvasReducer(afterSetTool, { type: "clearSelection" });
    expect(afterClear.selectedItems).toEqual([]);
    expect(afterClear.activeTool).toBe("select");
  });
});

describe("canvasReducer other actions leave selection untouched", () => {
  it("setViewport does not affect selectedItems", () => {
    const withSelection = canvasReducer(initialCanvasState, { type: "select", selection: panel1 });
    const rezoomed = canvasReducer(withSelection, { type: "setViewport", viewport: { scale: 2, panX: 10, panY: 10 } });
    expect(rezoomed.selectedItems).toEqual([panel1]);
    expect(rezoomed.viewport).toEqual({ scale: 2, panX: 10, panY: 10 });
  });

  it("toggleLayer/toggleSnap do not affect selectedItems", () => {
    const withSelection = canvasReducer(initialCanvasState, { type: "select", selection: panel1 });
    const toggled = canvasReducer(canvasReducer(withSelection, { type: "toggleLayer", layer: "grid" }), { type: "toggleSnap" });
    expect(toggled.selectedItems).toEqual([panel1]);
    expect(toggled.layerVisibility.grid).toBe(false);
    expect(toggled.snapEnabled).toBe(false);
  });

  it("reset returns to the initial state", () => {
    const mutated = canvasReducer(initialCanvasState, { type: "selectMultiple", items: [panel1, panel2] });
    expect(canvasReducer(mutated, { type: "reset" })).toEqual(initialCanvasState);
  });
});
