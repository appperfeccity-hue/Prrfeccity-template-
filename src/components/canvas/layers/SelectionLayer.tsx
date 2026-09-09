"use client";

import { Layer, Rect, Text } from "react-konva";
import type { DesignLayout } from "@/lib/canvas/layout";
import { basePxLengthToMm, mmLengthToBasePx } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

/**
 * The resize handle for a selected panel, ported from ZoneCanvas's
 * draggable blue bar. Zone/partition/panel/wall/edge selection highlight
 * outlines are drawn by their own layers (they already know the selection
 * state needed to color themselves); this layer only adds interaction
 * chrome that doesn't belong to a specific geometry layer. Furniture's
 * rotate Transformer lives in FurnitureLayer, next to the shapes it targets.
 */
export function SelectionLayer({
  layout,
  selection,
  onResizePanel,
  onRotatePanel,
}: {
  layout: DesignLayout;
  selection: CanvasSelection;
  onResizePanel?: (panelId: string, widthMm: number) => void;
  onRotatePanel?: (panelId: string, orientation: "VERTICAL" | "HORIZONTAL") => void;
}) {
  if (!selection || selection.kind !== "panel") return null;

  const panel = layout.zones.flatMap((z) => z.partitions.flatMap((p) => p.panels)).find((p) => p.id === selection.id);
  if (!panel) return null;

  const xPx = mmLengthToBasePx(panel.xMm);
  const wPx = mmLengthToBasePx(panel.widthMm);
  const hPx = mmLengthToBasePx(panel.heightMm);

  return (
    <Layer>
      {onResizePanel && (
        <Rect
          x={xPx + wPx - 3}
          y={0}
          width={6}
          height={hPx}
          fill="#2563eb"
          opacity={0.55}
          draggable
          dragBoundFunc={(pos) => ({ x: pos.x, y: 0 })}
          onDragEnd={(e) => {
            const newWidthMm = Math.max(1, Math.round(basePxLengthToMm(e.target.x() + 3 - xPx)));
            e.target.position({ x: xPx + wPx - 3, y: 0 });
            onResizePanel(panel.id, newWidthMm);
          }}
        />
      )}
      {onRotatePanel && (
        <Text
          text="⟳"
          x={xPx + wPx - 16}
          y={2}
          fontSize={13}
          fill="#2563eb"
          onClick={() => onRotatePanel(panel.id, panel.orientation === "VERTICAL" ? "HORIZONTAL" : "VERTICAL")}
          onTap={() => onRotatePanel(panel.id, panel.orientation === "VERTICAL" ? "HORIZONTAL" : "VERTICAL")}
        />
      )}
    </Layer>
  );
}
