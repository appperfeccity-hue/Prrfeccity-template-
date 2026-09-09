"use client";

import { Layer, Rect, Line, Text } from "react-konva";
import type { GeometryEdgeModel as GeometryEdge, WallModel as Wall } from "@/generated/prisma/models";
import { mmLengthToBasePx } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

const ROLE_COLOR: Record<string, string> = {
  TOP: "#2563eb",
  BOTTOM: "#16a34a",
  LEFT: "#dc2626",
  RIGHT: "#9333ea",
  CORNER: "#ea580c",
};

/** Wall frame + edge-role labels, ported from the old WallCanvas but drawn
 * at the wall's true mm position (0,0)-(lengthMm,heightMm) instead of its
 * own independent pixel scale. */
export function WallOutlineLayer({
  wall,
  edges,
  selection,
  onSelectWall,
}: {
  wall: Wall;
  edges: GeometryEdge[];
  selection: CanvasSelection;
  onSelectWall?: () => void;
}) {
  const w = mmLengthToBasePx(wall.lengthMm);
  const h = mmLengthToBasePx(wall.heightMm);
  const edgeByRole = (role: string) => edges.find((e) => e.edgeRole === role);
  const selected = selection?.kind === "wall";

  return (
    <Layer>
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        stroke={selected ? "#2563eb" : "#888"}
        strokeWidth={selected ? 3 : 2}
        fill="#f5f5f5"
        onClick={onSelectWall}
        onTap={onSelectWall}
      />
      {(["TOP", "BOTTOM", "LEFT", "RIGHT", "CORNER"] as const).flatMap((role) => {
        const edge = edgeByRole(role);
        if (!edge) return [];
        const color = ROLE_COLOR[role];
        if (role === "TOP") {
          return [
            <Line key={`${role}-line`} points={[0, 0, w, 0]} stroke={color} strokeWidth={4} />,
            <Text key={`${role}-label`} text="TOP" x={w / 2 - 14} y={-18} fontSize={11} fill={color} />,
          ];
        }
        if (role === "BOTTOM") {
          return [
            <Line key={`${role}-line`} points={[0, h, w, h]} stroke={color} strokeWidth={4} />,
            <Text key={`${role}-label`} text="BOTTOM" x={w / 2 - 22} y={h + 6} fontSize={11} fill={color} />,
          ];
        }
        if (role === "LEFT") {
          return [
            <Line key={`${role}-line`} points={[0, 0, 0, h]} stroke={color} strokeWidth={4} />,
            <Text key={`${role}-label`} text="LEFT" x={-34} y={h / 2 - 6} fontSize={11} fill={color} />,
          ];
        }
        if (role === "RIGHT") {
          return [
            <Line key={`${role}-line`} points={[w, 0, w, h]} stroke={color} strokeWidth={4} />,
            <Text key={`${role}-label`} text="RIGHT" x={w + 6} y={h / 2 - 6} fontSize={11} fill={color} />,
          ];
        }
        return [
          <Line key={`${role}-line`} points={[w - 16, 0, w, 0, w, 16]} stroke={color} strokeWidth={4} />,
          <Text key={`${role}-label`} text="CORNER" x={w - 50} y={18} fontSize={11} fill={color} />,
        ];
      })}
      <Text text={`${wall.lengthMm}mm x ${wall.heightMm}mm`} x={0} y={h + 26} fontSize={12} fill="#666" />
    </Layer>
  );
}
