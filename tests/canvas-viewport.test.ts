import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEWPORT,
  actualSize,
  clampScale,
  fitToContent,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
} from "@/lib/canvas/viewport";

describe("worldToScreen / screenToWorld", () => {
  it("round-trips a point through the default (identity) viewport", () => {
    const world = { x: 123, y: 456 };
    const screen = worldToScreen(world, DEFAULT_VIEWPORT);
    expect(screen).toEqual(world);
    expect(screenToWorld(screen, DEFAULT_VIEWPORT)).toEqual(world);
  });

  it("applies scale and pan", () => {
    const viewport = { scale: 2, panX: 100, panY: 50 };
    expect(worldToScreen({ x: 10, y: 10 }, viewport)).toEqual({ x: 120, y: 70 });
  });

  it("screenToWorld inverts worldToScreen for an arbitrary viewport", () => {
    const viewport = { scale: 1.75, panX: -30, panY: 12 };
    const world = { x: 87, y: -14 };
    const screen = worldToScreen(world, viewport);
    const back = screenToWorld(screen, viewport);
    expect(back.x).toBeCloseTo(world.x);
    expect(back.y).toBeCloseTo(world.y);
  });
});

describe("clampScale", () => {
  it("clamps within [min, max]", () => {
    expect(clampScale(0.001, 0.1, 8)).toBe(0.1);
    expect(clampScale(100, 0.1, 8)).toBe(8);
    expect(clampScale(2, 0.1, 8)).toBe(2);
  });
});

describe("zoomAtPoint", () => {
  it("keeps the base-px point under the pointer fixed on screen", () => {
    const viewport = { scale: 1, panX: 0, panY: 0 };
    const pointer = { x: 200, y: 150 };
    const worldUnderPointerBefore = screenToWorld(pointer, viewport);

    const zoomed = zoomAtPoint(viewport, pointer, 2);
    const worldUnderPointerAfter = screenToWorld(pointer, zoomed);

    expect(zoomed.scale).toBe(2);
    expect(worldUnderPointerAfter.x).toBeCloseTo(worldUnderPointerBefore.x);
    expect(worldUnderPointerAfter.y).toBeCloseTo(worldUnderPointerBefore.y);
  });

  it("respects min/max scale clamps", () => {
    const viewport = { scale: 0.15, panX: 0, panY: 0 };
    const zoomedOut = zoomAtPoint(viewport, { x: 0, y: 0 }, 0.01, 0.1, 8);
    expect(zoomedOut.scale).toBe(0.1);
  });
});

describe("panBy", () => {
  it("offsets panX/panY without touching scale", () => {
    const viewport = { scale: 1.5, panX: 10, panY: 10 };
    expect(panBy(viewport, 5, -5)).toEqual({ scale: 1.5, panX: 15, panY: 5 });
  });
});

describe("fitToContent", () => {
  it("scales down to fit content larger than the container, centering it", () => {
    const viewport = fitToContent({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, 0);
    // width-constrained: 1000/2000 = 0.5
    expect(viewport.scale).toBeCloseTo(0.5);
    expect(viewport.panX).toBeCloseTo(0);
    expect(viewport.panY).toBeCloseTo(250);
  });

  it("returns the default viewport for empty content", () => {
    expect(fitToContent({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual(DEFAULT_VIEWPORT);
  });
});

describe("actualSize", () => {
  it("returns scale 1 with the given padding as pan", () => {
    expect(actualSize(20)).toEqual({ scale: 1, panX: 20, panY: 20 });
  });
});
