"use client";

import * as React from "react";
import { Stage, Layer, Rect, Line, Text } from "react-konva";
import type Konva from "konva";
import type { FullDesign } from "@/lib/api/client";
import type { GeometryEdgeModel } from "@/generated/prisma/models";
import { SKU_DRAG_MIME, type SkuDragPayload } from "@/components/palette/SkuPalette";

const SCALE = 0.2;
const PAD = 30;
const GAP = 12;
const ZONE_LABEL_H = 22;
const PANEL_H = 90;

type Node = FullDesign["geometryNodes"][number];

export type ZoneCanvasDropTarget =
  | { kind: "partition"; id: string }
  | { kind: "panel"; id: string }
  | { kind: "edge"; id: string };

function edgeHasAnyFlag(edge: GeometryEdgeModel) {
  return edge.requiresTermination || edge.requiresConnector || edge.requiresTrim || edge.isLightingBoundary;
}

export function ZoneCanvas({
  nodes,
  selectedEdgeId,
  onSelectEdge,
  onDropSku,
  onResizePanel,
}: {
  nodes: Node[];
  selectedEdgeId?: string | null;
  onSelectEdge: (edge: GeometryEdgeModel) => void;
  onDropSku?: (payload: SkuDragPayload, target: ZoneCanvasDropTarget | null) => void;
  onResizePanel?: (panelId: string, widthMm: number) => void;
}) {
  const stageRef = React.useRef<Konva.Stage>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const zones = nodes.filter((n) => n.nodeType === "ZONE" && n.zone).sort((a, b) => a.zone!.orderIndex - b.zone!.orderIndex);
  const partitionsByZone = (zoneId: string) =>
    nodes
      .filter((n) => n.nodeType === "PARTITION" && n.partition?.zoneId === zoneId)
      .sort((a, b) => a.partition!.orderIndex - b.partition!.orderIndex);
  const panelsByPartition = (partitionId: string) =>
    nodes
      .filter((n) => n.nodeType === "PANEL" && n.panel?.partitionId === partitionId)
      .sort((a, b) => a.panel!.orderIndex - b.panel!.orderIndex);

  const totalWidthMm = zones.reduce((sum, z) => sum + z.zone!.widthMm, 0);
  const stageWidth = Math.max(400, totalWidthMm * SCALE + PAD * 2 + GAP * zones.length);
  const stageHeight = PAD * 2 + ZONE_LABEL_H + PANEL_H + 60;

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

    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) {
      onDropSku(payload, null);
      return;
    }
    const rect = container.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const shape = stage.getIntersection(pos);
    if (!shape) {
      onDropSku(payload, null);
      return;
    }
    const name = shape.name();
    const id = shape.id();
    if (name === "partition" || name === "panel" || name === "edge") {
      onDropSku(payload, { kind: name, id });
    } else {
      onDropSku(payload, null);
    }
  };

  let cursorX = PAD;
  const resizeHandles: { panelId: string; panelX: number; panelW: number }[] = [];

  return (
    <div className="canvas-wrap" ref={containerRef} onDragOver={handleDragOver} onDrop={handleDrop}>
      <Stage ref={stageRef} width={stageWidth} height={stageHeight}>
        <Layer>
          {zones.map((zoneNode) => {
            const zone = zoneNode.zone!;
            const zoneX = cursorX;
            const zoneW = zone.widthMm * SCALE;
            cursorX += zoneW + GAP;

            const partitions = partitionsByZone(zoneNode.id);
            let partitionCursor = zoneX;

            return (
              <React.Fragment key={zoneNode.id}>
                <Rect
                  x={zoneX}
                  y={PAD + ZONE_LABEL_H}
                  width={zoneW}
                  height={PANEL_H}
                  stroke="#666"
                  strokeWidth={1.5}
                  fill="#fff"
                />
                <Text
                  text={`Zone ${zone.orderIndex} (${zone.associatesWith}${zone.hasCoveLighting ? ", cove light" : ""})`}
                  x={zoneX}
                  y={PAD}
                  fontSize={11}
                  fill="#333"
                />

                {partitions.map((partitionNode) => {
                  const partition = partitionNode.partition!;
                  const partitionX = partitionCursor;
                  const partitionW = partition.widthMm * SCALE;
                  partitionCursor += partitionW;

                  const panels = panelsByPartition(partitionNode.id);
                  let panelCursor = partitionX;

                  return (
                    <React.Fragment key={partitionNode.id}>
                      <Rect
                        id={partitionNode.id}
                        name="partition"
                        x={partitionX}
                        y={PAD + ZONE_LABEL_H}
                        width={partitionW}
                        height={PANEL_H}
                        stroke="#a5b4fc"
                        strokeWidth={1}
                        dash={panels.length === 0 ? [4, 3] : undefined}
                        fill={panels.length === 0 ? "rgba(165,180,252,0.08)" : "transparent"}
                      />

                      {panels.map((panelNode) => {
                        const panel = panelNode.panel!;
                        const panelX = panelCursor;
                        const panelW = panel.widthMm * SCALE;
                        panelCursor += panelW;
                        if (onResizePanel) resizeHandles.push({ panelId: panelNode.id, panelX, panelW });

                        const startEdge = panelNode.edges.find((e) => (e.metadata as { side?: string } | null)?.side === "start");
                        const endEdge = panelNode.edges.find((e) => (e.metadata as { side?: string } | null)?.side === "end");

                        const edgeColor = (edge?: GeometryEdgeModel) => {
                          if (!edge) return "#ccc";
                          if (edge.id === selectedEdgeId) return "#111";
                          return edgeHasAnyFlag(edge) ? "#dc2626" : "#94a3b8";
                        };

                        return (
                          <React.Fragment key={panelNode.id}>
                            <Rect
                              id={panelNode.id}
                              name="panel"
                              x={panelX}
                              y={PAD + ZONE_LABEL_H}
                              width={panelW}
                              height={PANEL_H}
                              stroke={panel.isOffcut ? "#f59e0b" : "#bbb"}
                              fill={panel.isOffcut ? "#fffbeb" : "#fafafa"}
                            />
                            <Text
                              text={`P${panel.orderIndex}${panel.isOffcut ? " (offcut)" : ""}`}
                              x={panelX + 4}
                              y={PAD + ZONE_LABEL_H + 4}
                              fontSize={9}
                              fill={panel.isOffcut ? "#b45309" : "#999"}
                            />
                            {startEdge && (
                              <Line
                                id={startEdge.id}
                                name="edge"
                                points={[panelX, PAD + ZONE_LABEL_H, panelX, PAD + ZONE_LABEL_H + PANEL_H]}
                                stroke={edgeColor(startEdge)}
                                strokeWidth={5}
                                hitStrokeWidth={16}
                                onClick={() => onSelectEdge(startEdge)}
                                onTap={() => onSelectEdge(startEdge)}
                              />
                            )}
                            {endEdge && (
                              <Line
                                id={endEdge.id}
                                name="edge"
                                points={[panelX + panelW, PAD + ZONE_LABEL_H, panelX + panelW, PAD + ZONE_LABEL_H + PANEL_H]}
                                stroke={edgeColor(endEdge)}
                                strokeWidth={5}
                                hitStrokeWidth={16}
                                onClick={() => onSelectEdge(endEdge)}
                                onTap={() => onSelectEdge(endEdge)}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </Layer>
        {onResizePanel && (
          <Layer>
            {resizeHandles.map(({ panelId, panelX, panelW }) => (
              <Rect
                key={panelId}
                x={panelX + panelW - 3}
                y={PAD + ZONE_LABEL_H}
                width={6}
                height={PANEL_H}
                fill="#2563eb"
                opacity={0.55}
                draggable
                dragBoundFunc={(pos) => ({ x: pos.x, y: PAD + ZONE_LABEL_H })}
                onDragEnd={(e) => {
                  const newWidthMm = Math.max(1, Math.round((e.target.x() + 3 - panelX) / SCALE));
                  e.target.position({ x: panelX + panelW - 3, y: PAD + ZONE_LABEL_H });
                  onResizePanel(panelId, newWidthMm);
                }}
              />
            ))}
          </Layer>
        )}
      </Stage>
    </div>
  );
}
