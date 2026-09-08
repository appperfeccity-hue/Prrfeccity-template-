import { describe, expect, it } from "vitest";
import { createUndoRedoStack } from "@/lib/undo-redo-stack";

describe("createUndoRedoStack", () => {
  it("starts with nothing to undo or redo", () => {
    const stack = createUndoRedoStack();
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });

  it("undoes and redoes a single action", async () => {
    const calls: string[] = [];
    const stack = createUndoRedoStack();
    stack.pushAction({
      description: "test action",
      undo: async () => {
        calls.push("undo");
      },
      redo: async () => {
        calls.push("redo");
      },
    });

    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);

    await stack.undo();
    expect(calls).toEqual(["undo"]);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(true);

    await stack.redo();
    expect(calls).toEqual(["undo", "redo"]);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
  });

  it("pushing a new action clears the redo stack", async () => {
    const stack = createUndoRedoStack();
    stack.pushAction({ description: "a", undo: async () => {}, redo: async () => {} });
    await stack.undo();
    expect(stack.canRedo()).toBe(true);

    stack.pushAction({ description: "b", undo: async () => {}, redo: async () => {} });
    expect(stack.canRedo()).toBe(false);
  });

  it("undo/redo on an empty stack is a no-op", async () => {
    const stack = createUndoRedoStack();
    await expect(stack.undo()).resolves.toBeUndefined();
    await expect(stack.redo()).resolves.toBeUndefined();
  });

  it("mutable-id-closure pattern: redo mints a new id and a later undo retargets it, not the stale one", async () => {
    // Simulates the CREATE undo/redo pattern: undo/redo close over a mutable `currentId`
    // that redo reassigns after minting a fresh server id, so a subsequent undo
    // always deletes the CURRENT id rather than the id captured at push time.
    let nextId = 1;
    const deletedIds: number[] = [];
    const createdIds: number[] = [];

    const create = async () => {
      const newId = nextId++;
      createdIds.push(newId);
      return newId;
    };
    const remove = async (deleteId: number) => {
      deletedIds.push(deleteId);
    };

    const stack = createUndoRedoStack();

    const firstId = await create(); // id 1
    let currentId = firstId;
    stack.pushAction({
      description: "create thing",
      undo: async () => {
        await remove(currentId);
      },
      redo: async () => {
        currentId = await create();
      },
    });

    // Undo deletes the original id (1).
    await stack.undo();
    expect(deletedIds).toEqual([1]);

    // Redo mints a brand-new id (2) and updates the closure's currentId.
    await stack.redo();
    expect(createdIds).toEqual([1, 2]);
    expect(currentId).toBe(2);

    // A subsequent undo must retarget the NEW id (2), never the stale original (1).
    await stack.undo();
    expect(deletedIds).toEqual([1, 2]);
  });
});
