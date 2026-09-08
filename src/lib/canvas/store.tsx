"use client";

import { createContext, useCallback, useContext, useReducer } from "react";
import { DEFAULT_VIEWPORT, type Viewport } from "@/lib/canvas/viewport";

export type CanvasSelectionKind = "wall" | "zone" | "partition" | "panel" | "edge" | "instance";
export type CanvasSelection = { kind: CanvasSelectionKind; id: string } | null;

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

type CanvasState = {
  selection: CanvasSelection;
  activeTool: CanvasTool;
  viewport: Viewport;
  layerVisibility: CanvasLayerVisibility;
  snapEnabled: boolean;
};

const initialState: CanvasState = {
  selection: null,
  activeTool: "select",
  viewport: DEFAULT_VIEWPORT,
  layerVisibility: DEFAULT_LAYER_VISIBILITY,
  snapEnabled: true,
};

type CanvasAction =
  | { type: "select"; selection: CanvasSelection }
  | { type: "setTool"; tool: CanvasTool }
  | { type: "setViewport"; viewport: Viewport }
  | { type: "toggleLayer"; layer: keyof CanvasLayerVisibility }
  | { type: "toggleSnap" }
  | { type: "reset" };

function reducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "select":
      return { ...state, selection: action.selection };
    case "setTool":
      // Switching to a non-select tool clears the current selection -- a
      // draw/add/measure tool operates on the canvas, not an existing object.
      return { ...state, activeTool: action.tool, selection: action.tool === "select" ? state.selection : null };
    case "setViewport":
      return { ...state, viewport: action.viewport };
    case "toggleLayer":
      return { ...state, layerVisibility: { ...state.layerVisibility, [action.layer]: !state.layerVisibility[action.layer] } };
    case "toggleSnap":
      return { ...state, snapEnabled: !state.snapEnabled };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

type CanvasStoreValue = CanvasState & {
  select: (selection: CanvasSelection) => void;
  setTool: (tool: CanvasTool) => void;
  setViewport: (viewport: Viewport) => void;
  toggleLayer: (layer: keyof CanvasLayerVisibility) => void;
  toggleSnap: () => void;
  reset: () => void;
};

const CanvasStoreContext = createContext<CanvasStoreValue | null>(null);

export function CanvasStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const select = useCallback((selection: CanvasSelection) => dispatch({ type: "select", selection }), []);
  const setTool = useCallback((tool: CanvasTool) => dispatch({ type: "setTool", tool }), []);
  const setViewport = useCallback((viewport: Viewport) => dispatch({ type: "setViewport", viewport }), []);
  const toggleLayer = useCallback((layer: keyof CanvasLayerVisibility) => dispatch({ type: "toggleLayer", layer }), []);
  const toggleSnap = useCallback(() => dispatch({ type: "toggleSnap" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const value: CanvasStoreValue = { ...state, select, setTool, setViewport, toggleLayer, toggleSnap, reset };

  return <CanvasStoreContext.Provider value={value}>{children}</CanvasStoreContext.Provider>;
}

export function useCanvasStore() {
  const ctx = useContext(CanvasStoreContext);
  if (!ctx) throw new Error("useCanvasStore must be used within a CanvasStoreProvider");
  return ctx;
}
