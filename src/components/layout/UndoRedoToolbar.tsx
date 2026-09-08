"use client";

import { useUndoRedo } from "@/lib/undo-redo";

export function UndoRedoToolbar() {
  const { undo, redo, canUndo, canRedo, isProcessing, lastActionDescription, nextRedoDescription } = useUndoRedo();

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button
        className="btn btn-secondary"
        disabled={!canUndo || isProcessing}
        onClick={() => undo()}
        title={lastActionDescription ? `Undo: ${lastActionDescription}` : "Nothing to undo"}
      >
        Undo
      </button>
      <button
        className="btn btn-secondary"
        disabled={!canRedo || isProcessing}
        onClick={() => redo()}
        title={nextRedoDescription ? `Redo: ${nextRedoDescription}` : "Nothing to redo"}
      >
        Redo
      </button>
    </div>
  );
}
