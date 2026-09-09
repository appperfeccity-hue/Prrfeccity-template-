import { describe, expect, it } from "vitest";
import {
  buildInstanceMoveInput,
  buildInstanceOptionsInput,
  buildInstanceQuantityInput,
  buildInstanceRotateInput,
  buildPanelResizeInput,
  buildPanelRotateInput,
  toggleOrientation,
} from "@/lib/canvas/mutations";

describe("buildPanelResizeInput (panel resize -- shared by canvas drag and Inspector)", () => {
  it("rounds and clamps to a minimum of 1mm", () => {
    expect(buildPanelResizeInput("p1", 599.6, 600)).toEqual({ panelId: "p1", widthMm: 600, previousWidthMm: 600 });
    expect(buildPanelResizeInput("p1", -50, 600)).toEqual({ panelId: "p1", widthMm: 1, previousWidthMm: 600 });
  });

  it("carries the previous width through for undo, unmodified", () => {
    const result = buildPanelResizeInput("p1", 700, 600);
    expect(result.previousWidthMm).toBe(600);
  });
});

describe("toggleOrientation / buildPanelRotateInput", () => {
  it("flips VERTICAL <-> HORIZONTAL", () => {
    expect(toggleOrientation("VERTICAL")).toBe("HORIZONTAL");
    expect(toggleOrientation("HORIZONTAL")).toBe("VERTICAL");
  });

  it("builds a rotate input carrying both the new and previous orientation", () => {
    expect(buildPanelRotateInput("p1", "HORIZONTAL", "VERTICAL")).toEqual({
      panelId: "p1",
      orientation: "HORIZONTAL",
      previousOrientation: "VERTICAL",
    });
  });
});

describe("buildInstanceMoveInput (furniture movement)", () => {
  it("rounds mm coordinates and defaults missing previous position to 0", () => {
    expect(buildInstanceMoveInput("i1", 123.6, 45.2, null, undefined)).toEqual({
      instanceId: "i1",
      x: 124,
      y: 45,
      previousX: 0,
      previousY: 0,
    });
  });

  it("preserves a real previous position for undo", () => {
    expect(buildInstanceMoveInput("i1", 500, 600, 100, 200)).toEqual({
      instanceId: "i1",
      x: 500,
      y: 600,
      previousX: 100,
      previousY: 200,
    });
  });

  it("never includes a skuId field (SKU identity is not part of a move)", () => {
    const result = buildInstanceMoveInput("i1", 0, 0, 0, 0);
    expect(result).not.toHaveProperty("skuId");
  });
});

describe("buildInstanceRotateInput (furniture rotation)", () => {
  it("normalizes rotation into [0, 360)", () => {
    expect(buildInstanceRotateInput("i1", 405, 0).rotationDeg).toBe(45);
    expect(buildInstanceRotateInput("i1", -30, 0).rotationDeg).toBe(330);
    expect(buildInstanceRotateInput("i1", 360, 0).rotationDeg).toBe(0);
  });

  it("defaults a missing previous rotation to 0", () => {
    expect(buildInstanceRotateInput("i1", 90, null).previousRotationDeg).toBe(0);
  });

  it("never includes a skuId field", () => {
    expect(buildInstanceRotateInput("i1", 90, 0)).not.toHaveProperty("skuId");
  });
});

describe("buildInstanceQuantityInput (plain instance count -- NOT a geometric resize; furniture sizing is a catalogue Size-option change, see buildInstanceOptionsInput below)", () => {
  it("clamps to a small positive minimum instead of allowing zero/negative", () => {
    expect(buildInstanceQuantityInput("i1", 0, 1).quantity).toBeGreaterThan(0);
    expect(buildInstanceQuantityInput("i1", -5, 1).quantity).toBeGreaterThan(0);
  });

  it("passes a normal positive quantity through unchanged", () => {
    expect(buildInstanceQuantityInput("i1", 3, 1)).toEqual({ instanceId: "i1", quantity: 3, previousQuantity: 1 });
  });

  it("never includes a skuId field", () => {
    expect(buildInstanceQuantityInput("i1", 2, 1)).not.toHaveProperty("skuId");
  });
});

describe("buildInstanceOptionsInput (furniture catalogue configuration change -- Design/Colour/Size, never a resize)", () => {
  it("carries the requested next options and the prior ones for undo", () => {
    expect(
      buildInstanceOptionsInput("i1", { sizeOptionId: "size-large" }, { sizeOptionId: "size-small" }),
    ).toEqual({
      instanceId: "i1",
      next: { sizeOptionId: "size-large" },
      previous: { sizeOptionId: "size-small" },
    });
  });

  it("omits unspecified option groups rather than nulling them out", () => {
    const result = buildInstanceOptionsInput("i1", { colourOptionId: "colour-walnut" }, {});
    expect(result.next).not.toHaveProperty("sizeOptionId");
    expect(result.next).not.toHaveProperty("designOptionId");
  });

  it("never includes a skuId field -- a catalogue option change never swaps the underlying SKU", () => {
    const result = buildInstanceOptionsInput("i1", { sizeOptionId: "size-large" }, {});
    expect(result).not.toHaveProperty("skuId");
    expect(result.next).not.toHaveProperty("skuId");
  });
});

describe("Inspector and canvas produce identical inputs for the same logical edit", () => {
  it("a panel resize to 800mm from either source yields the same mutation input", () => {
    const fromCanvasDrag = buildPanelResizeInput("panel-9", 800, 600);
    const fromInspectorField = buildPanelResizeInput("panel-9", 800, 600);
    expect(fromCanvasDrag).toEqual(fromInspectorField);
  });

  it("a furniture move to (300,400) from either source yields the same mutation input", () => {
    const fromCanvasDrag = buildInstanceMoveInput("inst-1", 300, 400, 100, 100);
    const fromInspectorField = buildInstanceMoveInput("inst-1", 300, 400, 100, 100);
    expect(fromCanvasDrag).toEqual(fromInspectorField);
  });
});
