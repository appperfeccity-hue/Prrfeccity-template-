"use client";

import * as React from "react";
import { Stage, Layer, Rect, Line, Text } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import type { GeometryEdgeModel } from "@/generated/prisma/models";

const SCALE = 0.2;
const PAD = 30;
const GAP = 12;
const ZONE_LABEL_H = 22;
const PANEL_H = 90;

type Node = FullDesign["geometryNodes"][number];

function edgeHasAnyFlag(edge: GeometryEdgeModel) {
  return edge.requiresTermination || edge.requiresConnector || edge.requiresTrim || edge.isLightingBoundary;
}

export function ZoneCanvas({
  nodes,
  selectedEdgeId,
  onSelectEdge,
}: {
  nodes: Node[];
  selectedEdgeId?: string | null;
  onSelectEdge: (edge: GeometryEdgeModel) => void;
}) {
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

  let cursorX = PAD;

  return (
    <div className="canvas-wrap">
      <Stage width={stageWidth} height={stageHeight}>
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
                      {panels.map((panelNode) => {
                        const panel = panelNode.panel!;
                        const panelX = panelCursor;
                        const panelW = panel.widthMm * SCALE;
                        panelCursor += panelW;

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
                              x={panelX}
                              y={PAD + ZONE_LABEL_H}
                              width={panelW}
                              height={PANEL_H}
                              stroke="#bbb"
                              fill="#fafafa"
                            />
                            <Text
                              text={`P${panel.orderIndex}`}
                              x={panelX + 4}
                              y={PAD + ZONE_LABEL_H + 4}
                              fontSize={9}
                              fill="#999"
                            />
                            {startEdge && (
                              <Line
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
      </Stage>
    </div>
  );
}
