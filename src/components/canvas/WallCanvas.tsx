"use client";

import { Stage, Layer, Rect, Line, Text } from "react-konva";
import type { GeometryEdgeModel as GeometryEdge, WallModel as Wall } from "@/generated/prisma/models";

const SCALE = 0.2; // mm -> px
const PAD = 40;

export function WallCanvas({ wall, edges }: { wall: Wall; edges: GeometryEdge[] }) {
  const w = wall.lengthMm * SCALE;
  const h = wall.heightMm * SCALE;
  const width = w + PAD * 2;
  const height = h + PAD * 2;

  const edgeLabel = (role: string) => edges.find((e) => e.edgeRole === role);

  return (
    <div className="canvas-wrap">
      <Stage width={width} height={height}>
        <Layer>
          <Rect x={PAD} y={PAD} width={w} height={h} stroke="#888" strokeWidth={2} fill="#f5f5f5" />

          {edgeLabel("TOP") && (
            <>
              <Line points={[PAD, PAD, PAD + w, PAD]} stroke="#2563eb" strokeWidth={4} />
              <Text text="TOP" x={PAD + w / 2 - 14} y={PAD - 18} fontSize={11} fill="#2563eb" />
            </>
          )}
          {edgeLabel("BOTTOM") && (
            <>
              <Line points={[PAD, PAD + h, PAD + w, PAD + h]} stroke="#16a34a" strokeWidth={4} />
              <Text text="BOTTOM" x={PAD + w / 2 - 22} y={PAD + h + 6} fontSize={11} fill="#16a34a" />
            </>
          )}
          {edgeLabel("LEFT") && (
            <>
              <Line points={[PAD, PAD, PAD, PAD + h]} stroke="#dc2626" strokeWidth={4} />
              <Text text="LEFT" x={PAD - 34} y={PAD + h / 2 - 6} fontSize={11} fill="#dc2626" />
            </>
          )}
          {edgeLabel("RIGHT") && (
            <>
              <Line points={[PAD + w, PAD, PAD + w, PAD + h]} stroke="#9333ea" strokeWidth={4} />
              <Text text="RIGHT" x={PAD + w + 6} y={PAD + h / 2 - 6} fontSize={11} fill="#9333ea" />
            </>
          )}
          {edgeLabel("CORNER") && (
            <>
              <Line
                points={[PAD + w - 16, PAD, PAD + w, PAD, PAD + w, PAD + 16]}
                stroke="#ea580c"
                strokeWidth={4}
              />
              <Text text="CORNER" x={PAD + w - 50} y={PAD + 18} fontSize={11} fill="#ea580c" />
            </>
          )}

          <Text text={`${wall.lengthMm}mm x ${wall.heightMm}mm`} x={PAD} y={height - 20} fontSize={12} fill="#666" />
        </Layer>
      </Stage>
    </div>
  );
}
