import { DEFAULT_VIEWPORT, type Viewport } from "@/lib/canvas/viewport";

/**
 * Pure reducer for the canvas store -- no React import, directly
 * unit-testable. src/lib/canvas/store.tsx wraps this in a Context/useReducer
 * provider; keeping the reducer itself framework-free lets the selection
 * model (including the multi-select groundwork below) be tested without
 * mounting anything.
 */

export type CanvasSelectionKind = "wall" | "zone" | "partition" | "panel" | "edge" | "instance";
export type CanvasSelectionItem = { kind: CanvasSelectionKind; id: string };
/** The "primary" selection -- the first selected item, or null. Every M4
 * layer/consumer reads this single-value shape; multi-select (selectedItems)
 * is additive and doesn't require touching any of that existing code. */
export type CanvasSelection = CanvasSelectionItem | null;

export type CanvasTool =
  | "select"
  | "pan"
  | "draw-wall"
  | "add-zone"
  | "add-partition"
  | "add-opening"
  | "add-obstruction"
  | "add-divider"
  | "measure";

export type CanvasLayerVisibility = {
  grid: boolean;
  dependencies: boolean;
  validation: boolean;
  furniture: boolean;
};

const DEFAULT_LAYER_VISIBILITY: CanvasLayerVisibility = {
  grid: true,
  dependencies: true,
  validation: true,
  furniture: true,
};

export type CanvasState = {
  selectedItems: CanvasSelectionItem[];
  activeTool: CanvasTool;
  viewport: Viewport;
  layerVisibility: CanvasLayerVisibility;
  snapEnabled: boolean;
};

export const initialCanvasState: CanvasState = {
  selectedItems: [],
  activeTool: "select",
  viewport: DEFAULT_VIEWPORT,
  layerVisibility: DEFAULT_LAYER_VISIBILITY,
  snapEnabled: true,
};

function sameItem(a: CanvasSelectionItem, b: CanvasSelectionItem) {
  return a.kind === b.kind && a.id === b.id;
}

export type CanvasAction =
  | { type: "select"; selection: CanvasSelection }
  | { type: "selectMultiple"; items: CanvasSelectionItem[] }
  | { type: "addToSelection"; item: CanvasSelectionItem }
  | { type: "toggleInSelection"; item: CanvasSelectionItem }
  | { type: "clearSelection" }
  | { type: "setTool"; tool: CanvasTool }
  | { type: "setViewport"; viewport: Viewport }
  | { type: "toggleLayer"; layer: keyof CanvasLayerVisibility }
  | { type: "toggleSnap" }
  | { type: "reset" };

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "select":
      return { ...state, selectedItems: action.selection ? [action.selection] : [] };
    case "selectMultiple":
      return { ...state, selectedItems: action.items };
    case "addToSelection":
      if (state.selectedItems.some((i) => sameItem(i, action.item))) return state;
      return { ...state, selectedItems: [...state.selectedItems, action.item] };
    case "toggleInSelection": {
      const exists = state.selectedItems.some((i) => sameItem(i, action.item));
      return {
        ...state,
        selectedItems: exists
          ? state.selectedItems.filter((i) => !sameItem(i, action.item))
          : [...state.selectedItems, action.item],
      };
    }
    case "clearSelection":
      return { ...state, selectedItems: [] };
    case "setTool":
      // Switching to a non-select tool clears the current selection -- a
      // draw/add/measure tool operates on the canvas, not an existing object.
      return { ...state, activeTool: action.tool, selectedItems: action.tool === "select" ? state.selectedItems : [] };
    case "setViewport":
      return { ...state, viewport: action.viewport };
    case "toggleLayer":
      return { ...state, layerVisibility: { ...state.layerVisibility, [action.layer]: !state.layerVisibility[action.layer] } };
    case "toggleSnap":
      return { ...state, snapEnabled: !state.snapEnabled };
    case "reset":
      return initialCanvasState;
    default:
      return state;
  }
}
