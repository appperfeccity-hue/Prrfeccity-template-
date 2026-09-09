import { describe, expect, it } from "vitest";
import {
  BASE_SCALE,
  basePxLengthToMm,
  basePxToMm,
  mmLengthToBasePx,
  mmToBasePx,
  mmToScreen,
  resolvePointerMm,
  screenToMm,
  snapMmPoint,
} from "@/lib/canvas/coords";
import { DEFAULT_VIEWPORT } from "@/lib/canvas/viewport";
import { GRID_SNAP_MM } from "@/lib/canvas/scale";

describe("mm <-> base px", () => {
  it("converts a point using BASE_SCALE", () => {
    expect(mmToBasePx({ x: 1000, y: 500 })).toEqual({ x: 1000 * BASE_SCALE, y: 500 * BASE_SCALE });
  });

  it("round-trips through basePxToMm", () => {
    const mm = { x: 1234, y: -56 };
    expect(basePxToMm(mmToBasePx(mm))).toEqual(mm);
  });

  it("converts lengths symmetrically", () => {
    expect(mmLengthToBasePx(600)).toBeCloseTo(600 * BASE_SCALE);
    expect(basePxLengthToMm(mmLengthToBasePx(600))).toBeCloseTo(600);
  });
});

describe("mm <-> screen (composed with viewport)", () => {
  it("matches mmToBasePx at the default (identity) viewport", () => {
    const mm = { x: 3000, y: 2400 };
    expect(mmToScreen(mm, DEFAULT_VIEWPORT)).toEqual(mmToBasePx(mm));
  });

  it("round-trips through screenToMm for an arbitrary viewport", () => {
    const viewport = { scale: 2.5, panX: 40, panY: -10 };
    const mm = { x: 1800, y: 900 };
    const screen = mmToScreen(mm, viewport);
    const back = screenToMm(screen, viewport);
    expect(back.x).toBeCloseTo(mm.x);
    expect(back.y).toBeCloseTo(mm.y);
  });

  it("a pointer at the wall origin under the default viewport lands at mm (0,0)", () => {
    expect(screenToMm({ x: 0, y: 0 }, DEFAULT_VIEWPORT)).toEqual({ x: 0, y: 0 });
  });
});

describe("snapMmPoint", () => {
  it("snaps both axes to the grid when enabled", () => {
    expect(snapMmPoint({ x: 130, y: 470 }, true)).toEqual({
      x: Math.round(130 / GRID_SNAP_MM) * GRID_SNAP_MM,
      y: Math.round(470 / GRID_SNAP_MM) * GRID_SNAP_MM,
    });
  });

  it("passes the point through unchanged when disabled", () => {
    expect(snapMmPoint({ x: 133, y: 471 }, false)).toEqual({ x: 133, y: 471 });
  });
});

describe("resolvePointerMm (drag -> domain-coordinate conversion)", () => {
  it("converts a screen drop point into snapped mm at the default viewport", () => {
    // 530px at BASE_SCALE=0.2 -> 2650mm -> snaps to nearest 100mm -> 2700mm
    const result = resolvePointerMm({ x: 530, y: 0 }, DEFAULT_VIEWPORT, true);
    expect(result.x).toBe(2700);
  });

  it("accounts for zoom/pan before snapping", () => {
    const viewport = { scale: 2, panX: 100, panY: 0 };
    // screen 300 -> world (300-100)/2 = 100 base px -> 500mm -> snaps to 500
    const result = resolvePointerMm({ x: 300, y: 0 }, viewport, true);
    expect(result.x).toBe(500);
  });

  it("does not snap when disabled", () => {
    const result = resolvePointerMm({ x: 537, y: 0 }, DEFAULT_VIEWPORT, false);
    expect(result.x).toBeCloseTo(537 / BASE_SCALE);
  });
});
