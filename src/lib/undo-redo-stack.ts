export type UndoableAction = {
  description: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

export type UndoRedoStack = {
  pushAction: (action: UndoableAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  lastActionDescription: () => string | null;
  nextRedoDescription: () => string | null;
};

export function createUndoRedoStack(): UndoRedoStack {
  const undoStack: UndoableAction[] = [];
  const redoStack: UndoableAction[] = [];

  return {
    pushAction(action) {
      undoStack.push(action);
      redoStack.length = 0;
    },
    async undo() {
      const action = undoStack.pop();
      if (!action) return;
      await action.undo();
      redoStack.push(action);
    },
    async redo() {
      const action = redoStack.pop();
      if (!action) return;
      await action.redo();
      undoStack.push(action);
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    lastActionDescription() {
      return undoStack.length > 0 ? undoStack[undoStack.length - 1].description : null;
    },
    nextRedoDescription() {
      return redoStack.length > 0 ? redoStack[redoStack.length - 1].description : null;
    },
  };
}
