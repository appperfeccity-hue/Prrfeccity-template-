"use client";

import * as React from "react";
import { createUndoRedoStack, type UndoableAction } from "@/lib/undo-redo-stack";

type UndoRedoContextValue = {
  pushAction: (action: UndoableAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  isProcessing: boolean;
  lastActionDescription: string | null;
  nextRedoDescription: string | null;
};

const UndoRedoContext = React.createContext<UndoRedoContextValue | null>(null);

type Snapshot = {
  canUndo: boolean;
  canRedo: boolean;
  lastActionDescription: string | null;
  nextRedoDescription: string | null;
};

function readSnapshot(stack: ReturnType<typeof createUndoRedoStack>): Snapshot {
  return {
    canUndo: stack.canUndo(),
    canRedo: stack.canRedo(),
    lastActionDescription: stack.lastActionDescription(),
    nextRedoDescription: stack.nextRedoDescription(),
  };
}

export function UndoRedoProvider({ children }: { children: React.ReactNode }) {
  const stackRef = React.useRef(createUndoRedoStack());
  const [isProcessing, setIsProcessing] = React.useState(false);
  // A freshly created stack always starts empty, so the initial snapshot is known
  // without reading the ref during render.
  const [snapshot, setSnapshot] = React.useState<Snapshot>({
    canUndo: false,
    canRedo: false,
    lastActionDescription: null,
    nextRedoDescription: null,
  });

  const pushAction = React.useCallback((action: UndoableAction) => {
    stackRef.current.pushAction(action);
    setSnapshot(readSnapshot(stackRef.current));
  }, []);

  const undo = React.useCallback(async () => {
    if (isProcessing || !stackRef.current.canUndo()) return;
    setIsProcessing(true);
    try {
      await stackRef.current.undo();
    } finally {
      setIsProcessing(false);
      setSnapshot(readSnapshot(stackRef.current));
    }
  }, [isProcessing]);

  const redo = React.useCallback(async () => {
    if (isProcessing || !stackRef.current.canRedo()) return;
    setIsProcessing(true);
    try {
      await stackRef.current.redo();
    } finally {
      setIsProcessing(false);
      setSnapshot(readSnapshot(stackRef.current));
    }
  }, [isProcessing]);

  const value: UndoRedoContextValue = {
    pushAction,
    undo,
    redo,
    isProcessing,
    ...snapshot,
  };

  return <UndoRedoContext.Provider value={value}>{children}</UndoRedoContext.Provider>;
}

export function useUndoRedo() {
  const ctx = React.useContext(UndoRedoContext);
  if (!ctx) throw new Error("useUndoRedo must be used within an UndoRedoProvider");
  return ctx;
}
