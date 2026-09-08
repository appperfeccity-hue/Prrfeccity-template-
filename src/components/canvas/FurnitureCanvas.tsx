"use client";

import * as React from "react";
import { Stage, Layer, Rect, Circle, Text } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import type { KonvaEventObject } from "konva/lib/Node";

const STAGE_W = 700;
const STAGE_H = 400;

export function FurnitureCanvas({
  instances,
  onPlace,
}: {
  instances: FullDesign["productInstances"];
  onPlace: (x: number, y: number) => void;
}) {
  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (pos) onPlace(Math.round(pos.x), Math.round(pos.y));
  };

  return (
    <div className="canvas-wrap">
      <Stage width={STAGE_W} height={STAGE_H} onClick={handleClick}>
        <Layer>
          <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill="#fafafa" stroke="#ddd" />
          <Text text="Click anywhere to place the selected furniture SKU at that x/y" x={10} y={10} fontSize={12} fill="#888" />
          {instances.map((inst) => (
            <React.Fragment key={inst.id}>
              <Circle x={inst.x ?? 0} y={inst.y ?? 0} radius={8} fill="#9333ea" />
              <Text text={inst.sku?.code ?? ""} x={(inst.x ?? 0) + 12} y={(inst.y ?? 0) - 6} fontSize={11} fill="#555" />
            </React.Fragment>
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
