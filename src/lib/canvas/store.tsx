"use client";

import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { Viewport } from "@/lib/canvas/viewport";
import {
  canvasReducer,
  initialCanvasState,
  type CanvasLayerVisibility,
  type CanvasSelection,
  type CanvasSelectionItem,
  type CanvasSelectionKind,
  type CanvasTool,
} from "@/lib/canvas/store-reducer";

export type { CanvasLayerVisibility, CanvasSelection, CanvasSelectionItem, CanvasSelectionKind, CanvasTool };

type CanvasStoreValue = {
  /** The primary (first) selected item, or null -- the shape every M4 layer
   * already consumes. Unaffected by whether multi-select is in use. */
  selection: CanvasSelection;
  /** Full multi-select set (empty, one, or many items). Not yet driven by
   * any UI in M5 -- shift-click/marquee selection is explicitly deferred --
   * but the store, reducer, and this API already support it so that UI can
   * be added later without touching the selection model again. */
  selectedItems: CanvasSelectionItem[];
  activeTool: CanvasTool;
  viewport: Viewport;
  layerVisibility: CanvasLayerVisibility;
  snapEnabled: boolean;
  select: (selection: CanvasSelection) => void;
  selectMultiple: (items: CanvasSelectionItem[]) => void;
  addToSelection: (item: CanvasSelectionItem) => void;
  toggleInSelection: (item: CanvasSelectionItem) => void;
  clearSelection: () => void;
  setTool: (tool: CanvasTool) => void;
  setViewport: (viewport: Viewport) => void;
  toggleLayer: (layer: keyof CanvasLayerVisibility) => void;
  toggleSnap: () => void;
  reset: () => void;
};

const CanvasStoreContext = createContext<CanvasStoreValue | null>(null);

export function CanvasStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(canvasReducer, initialCanvasState);

  const select = useCallback((selection: CanvasSelection) => dispatch({ type: "select", selection }), []);
  const selectMultiple = useCallback((items: CanvasSelectionItem[]) => dispatch({ type: "selectMultiple", items }), []);
  const addToSelection = useCallback((item: CanvasSelectionItem) => dispatch({ type: "addToSelection", item }), []);
  const toggleInSelection = useCallback((item: CanvasSelectionItem) => dispatch({ type: "toggleInSelection", item }), []);
  const clearSelection = useCallback(() => dispatch({ type: "clearSelection" }), []);
  const setTool = useCallback((tool: CanvasTool) => dispatch({ type: "setTool", tool }), []);
  const setViewport = useCallback((viewport: Viewport) => dispatch({ type: "setViewport", viewport }), []);
  const toggleLayer = useCallback((layer: keyof CanvasLayerVisibility) => dispatch({ type: "toggleLayer", layer }), []);
  const toggleSnap = useCallback(() => dispatch({ type: "toggleSnap" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const selection = state.selectedItems[0] ?? null;

  const value: CanvasStoreValue = useMemo(
    () => ({
      selection,
      selectedItems: state.selectedItems,
      activeTool: state.activeTool,
      viewport: state.viewport,
      layerVisibility: state.layerVisibility,
      snapEnabled: state.snapEnabled,
      select,
      selectMultiple,
      addToSelection,
      toggleInSelection,
      clearSelection,
      setTool,
      setViewport,
      toggleLayer,
      toggleSnap,
      reset,
    }),
    [
      state,
      selection,
      select,
      selectMultiple,
      addToSelection,
      toggleInSelection,
      clearSelection,
      setTool,
      setViewport,
      toggleLayer,
      toggleSnap,
      reset,
    ],
  );

  return <CanvasStoreContext.Provider value={value}>{children}</CanvasStoreContext.Provider>;
}

export function useCanvasStore() {
  const ctx = useContext(CanvasStoreContext);
  if (!ctx) throw new Error("useCanvasStore must be used within a CanvasStoreProvider");
  return ctx;
}
