"use client";

import { Fragment } from "react";
import { Layer, Line } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import type { GeometryEdgeModel } from "@/generated/prisma/models";
import type { DesignLayout } from "@/lib/canvas/layout";
import { mmLengthToBasePx } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

function edgeHasAnyFlag(edge: GeometryEdgeModel) {
  return edge.requiresTermination || edge.requiresConnector || edge.requiresTrim || edge.isLightingBoundary;
}

/**
 * The trim/connector/termination/lighting-boundary indicator lines drawn on
 * each panel's start/end edge, ported from ZoneCanvas's edge rendering --
 * split into its own layer per the Phase 4 layer structure so flag state is
 * visually distinct from raw panel geometry.
 */
export function TrimsLayer({
  design,
  layout,
  selection,
  onSelectEdge,
}: {
  design: FullDesign;
  layout: DesignLayout;
  selection: CanvasSelection;
  onSelectEdge?: (edge: GeometryEdgeModel) => void;
}) {
  const nodeById = new Map(design.geometryNodes.map((n) => [n.id, n]));

  return (
    <Layer>
      {layout.zones.flatMap((zone) =>
        zone.partitions.flatMap((partition) =>
          partition.panels.map((panel) => {
            const node = nodeById.get(panel.id);
            if (!node) return null;
            const startEdge = node.edges.find((e) => (e.metadata as { side?: string } | null)?.side === "start");
            const endEdge = node.edges.find((e) => (e.metadata as { side?: string } | null)?.side === "end");
            const panelXPx = mmLengthToBasePx(panel.xMm);
            const panelWPx = mmLengthToBasePx(panel.widthMm);
            const panelHPx = mmLengthToBasePx(panel.heightMm);

            const edgeColor = (edge?: GeometryEdgeModel) => {
              if (!edge) return "#ccc";
              if (selection?.kind === "edge" && selection.id === edge.id) return "#111";
              return edgeHasAnyFlag(edge) ? "#dc2626" : "#94a3b8";
            };

            return (
              <Fragment key={panel.id}>
                {startEdge && (
                  <Line
                    key={startEdge.id}
                    id={startEdge.id}
                    name="edge"
                    points={[panelXPx, 0, panelXPx, panelHPx]}
                    stroke={edgeColor(startEdge)}
                    strokeWidth={5}
                    hitStrokeWidth={16}
                    onClick={() => onSelectEdge?.(startEdge)}
                    onTap={() => onSelectEdge?.(startEdge)}
                  />
                )}
                {endEdge && (
                  <Line
                    key={endEdge.id}
                    id={endEdge.id}
                    name="edge"
                    points={[panelXPx + panelWPx, 0, panelXPx + panelWPx, panelHPx]}
                    stroke={edgeColor(endEdge)}
                    strokeWidth={5}
                    hitStrokeWidth={16}
                    onClick={() => onSelectEdge?.(endEdge)}
                    onTap={() => onSelectEdge?.(endEdge)}
                  />
                )}
              </Fragment>
            );
          }),
        ),
      )}
    </Layer>
  );
}
