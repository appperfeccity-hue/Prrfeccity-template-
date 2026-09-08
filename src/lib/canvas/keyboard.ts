"use client";

import { useEffect, useRef, useState } from "react";
import { useUndoRedo } from "@/lib/undo-redo";
import { useCanvasStore } from "@/lib/canvas/store";

export type KeyboardModifiers = { shift: boolean; alt: boolean };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Global keyboard shortcuts for the Design workspace: Cmd/Ctrl+Z undo,
 * Cmd/Ctrl+Shift+Z redo (both call straight into the existing useUndoRedo()
 * context -- no separate undo mechanism), Escape resets the active tool to
 * "select", Space temporarily switches to the pan tool while held. Returns
 * live Shift/Alt state for drag handlers that need to read movement
 * modifiers (constrain / duplicate).
 */
export function useKeyboardShortcuts() {
  const { undo, redo, canUndo, canRedo, isProcessing } = useUndoRedo();
  const { activeTool, setTool } = useCanvasStore();
  const [modifiers, setModifiers] = useState<KeyboardModifiers>({ shift: false, alt: false });
  const spaceActiveRef = useRef(false);
  const preSpaceToolRef = useRef<typeof activeTool>("select");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.key === "Shift") setModifiers((m) => ({ ...m, shift: true }));
      if (e.key === "Alt") setModifiers((m) => ({ ...m, alt: true }));

      const isModZ = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z";
      if (isModZ) {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo && !isProcessing) redo();
        } else if (canUndo && !isProcessing) {
          undo();
        }
        return;
      }

      if (e.key === "Escape") {
        setTool("select");
        return;
      }

      if (e.code === "Space" && !spaceActiveRef.current) {
        e.preventDefault();
        spaceActiveRef.current = true;
        preSpaceToolRef.current = activeTool;
        setTool("pan");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setModifiers((m) => ({ ...m, shift: false }));
      if (e.key === "Alt") setModifiers((m) => ({ ...m, alt: false }));
      if (e.code === "Space" && spaceActiveRef.current) {
        spaceActiveRef.current = false;
        setTool(preSpaceToolRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [undo, redo, canUndo, canRedo, isProcessing, setTool, activeTool]);

  return modifiers;
}
