"use client";

import { Fragment, useEffect, useRef } from "react";
import { Layer, Rect, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { FullDesign } from "@/lib/api/client";
import { basePxToMm, mmToBasePx } from "@/lib/canvas/coords";
import { snapMmPoint } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

const MARKER_SIZE = 24;

/**
 * Freestanding furniture instances, ported from the old FurnitureCanvas.
 * ProductInstance.x/y are now interpreted as real mm relative to the wall
 * origin (they used to be raw pixels inside FurnitureCanvas's own fixed
 * 700x400 box) -- see the Phase 4 plan's explicit call-out on this
 * reinterpretation: no data is migrated, only how it's drawn.
 */
export function FurnitureLayer({
  instances,
  selection,
  snapEnabled,
  onSelect,
  onMove,
  onRotate,
  onDragPreview,
}: {
  instances: FullDesign["productInstances"];
  selection: CanvasSelection;
  snapEnabled: boolean;
  onSelect?: (id: string) => void;
  onMove?: (instanceId: string, xMm: number, yMm: number) => void;
  onRotate?: (instanceId: string, rotationDeg: number) => void;
  onDragPreview?: (mm: { x: number; y: number } | null) => void;
}) {
  const shapeRefs = useRef<Map<string, Konva.Rect>>(new Map());
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedId = selection?.kind === "instance" ? selection.id : null;

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedId ? shapeRefs.current.get(selectedId) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, instances]);

  return (
    <Layer>
      {instances.map((inst) => {
        const basePx = mmToBasePx({ x: inst.x ?? 0, y: inst.y ?? 0 });
        return (
          <Fragment key={inst.id}>
            <Rect
              ref={(node) => {
                if (node) shapeRefs.current.set(inst.id, node);
                else shapeRefs.current.delete(inst.id);
              }}
              id={inst.id}
              name="instance"
              x={basePx.x}
              y={basePx.y}
              width={MARKER_SIZE}
              height={MARKER_SIZE}
              offsetX={MARKER_SIZE / 2}
              offsetY={MARKER_SIZE / 2}
              rotation={inst.rotationDeg ?? 0}
              fill={selectedId === inst.id ? "#7c3aed" : "#9333ea"}
              stroke={selectedId === inst.id ? "#4c1d95" : undefined}
              strokeWidth={selectedId === inst.id ? 2 : 0}
              draggable
              onClick={(e) => {
                e.cancelBubble = true;
                onSelect?.(inst.id);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                onSelect?.(inst.id);
              }}
              onDragMove={(e) => {
                const mm = snapMmPoint(basePxToMm({ x: e.target.x(), y: e.target.y() }), snapEnabled);
                onDragPreview?.(mm);
              }}
              onDragEnd={(e) => {
                const node = e.target;
                const mm = snapMmPoint(basePxToMm({ x: node.x(), y: node.y() }), snapEnabled);
                const snappedPx = mmToBasePx(mm);
                node.position(snappedPx);
                onMove?.(inst.id, mm.x, mm.y);
                onDragPreview?.(null);
              }}
              onTransformEnd={(e) => {
                const rotation = Math.round(e.target.rotation());
                onRotate?.(inst.id, rotation);
              }}
            />
            <Text
              text={inst.sku?.code ?? ""}
              x={basePx.x + MARKER_SIZE / 2 + 4}
              y={basePx.y - 6}
              fontSize={11}
              fill="#555"
              listening={false}
            />
          </Fragment>
        );
      })}
      <Transformer ref={transformerRef} rotateEnabled resizeEnabled={false} />
    </Layer>
  );
}
