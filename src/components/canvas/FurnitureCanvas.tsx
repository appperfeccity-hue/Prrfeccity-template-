"use client";

import * as React from "react";
import { Stage, Layer, Rect, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { FullDesign } from "@/lib/api/client";
import type { KonvaEventObject } from "konva/lib/Node";
import { snapToGrid } from "@/lib/canvas/scale";
import { SKU_DRAG_MIME, type SkuDragPayload } from "@/components/palette/SkuPalette";

const STAGE_W = 700;
const STAGE_H = 400;
const MARKER_SIZE = 24;

export function FurnitureCanvas({
  instances,
  onPlace,
  onDropSku,
  onMove,
  onRotate,
}: {
  instances: FullDesign["productInstances"];
  onPlace: (x: number, y: number) => void;
  onDropSku?: (payload: SkuDragPayload, x: number, y: number) => void;
  onMove?: (instanceId: string, x: number, y: number) => void;
  onRotate?: (instanceId: string, rotationDeg: number) => void;
}) {
  const stageRef = React.useRef<Konva.Stage>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const shapeRefs = React.useRef<Map<string, Konva.Rect>>(new Map());
  const transformerRef = React.useRef<Konva.Transformer>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selectedInstance = instances.find((i) => i.id === selectedId);
  const rotateEnabled = selectedInstance?.sku?.rotatable ?? true;

  React.useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedId ? shapeRefs.current.get(selectedId) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, instances]);

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) return;
    setSelectedId(null);
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (pos) onPlace(snapToGrid(pos.x), snapToGrid(pos.y));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!onDropSku) return;
    const raw = e.dataTransfer.getData(SKU_DRAG_MIME);
    if (!raw) return;
    let payload: SkuDragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = snapToGrid(e.clientX - rect.left);
    const y = snapToGrid(e.clientY - rect.top);
    onDropSku(payload, x, y);
  };

  return (
    <div className="canvas-wrap" ref={containerRef} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Stage ref={stageRef} width={STAGE_W} height={STAGE_H} onClick={handleStageClick}>
        <Layer>
          <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill="#fafafa" stroke="#ddd" />
          <Text
            text="Click, or drag a SKU from the palette, to place furniture. Drag a marker to move it; select it and use the corner handle to rotate."
            x={10}
            y={10}
            fontSize={11}
            fill="#888"
            width={STAGE_W - 20}
          />
          {instances.map((inst) => (
            <React.Fragment key={inst.id}>
              <Rect
                ref={(node) => {
                  if (node) shapeRefs.current.set(inst.id, node);
                  else shapeRefs.current.delete(inst.id);
                }}
                x={inst.x ?? 0}
                y={inst.y ?? 0}
                width={MARKER_SIZE}
                height={MARKER_SIZE}
                offsetX={MARKER_SIZE / 2}
                offsetY={MARKER_SIZE / 2}
                rotation={inst.rotationDeg ?? 0}
                fill="#9333ea"
                draggable
                onClick={(e) => {
                  e.cancelBubble = true;
                  setSelectedId(inst.id);
                }}
                onDragEnd={(e) => {
                  const node = e.target;
                  const x = snapToGrid(node.x());
                  const y = snapToGrid(node.y());
                  node.position({ x, y });
                  onMove?.(inst.id, x, y);
                }}
                onTransformEnd={(e) => {
                  const rotation = Math.round(e.target.rotation());
                  onRotate?.(inst.id, rotation);
                }}
              />
              <Text
                text={inst.sku?.code ?? ""}
                x={(inst.x ?? 0) + MARKER_SIZE / 2 + 4}
                y={(inst.y ?? 0) - 6}
                fontSize={11}
                fill="#555"
              />
            </React.Fragment>
          ))}
          <Transformer ref={transformerRef} rotateEnabled={rotateEnabled} resizeEnabled={false} />
        </Layer>
      </Stage>
    </div>
  );
}
