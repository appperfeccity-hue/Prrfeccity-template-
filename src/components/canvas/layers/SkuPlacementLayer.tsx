"use client";

import { Layer, Text } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import type { DesignLayout, PanelLayout } from "@/lib/canvas/layout";
import { mmLengthToBasePx } from "@/lib/canvas/coords";

/**
 * Small SKU-code badges marking which product instance a
 * GeometryProductRelationship attaches to a panel or a panel's flagged
 * edge -- this is new visualization (the old canvases never showed this;
 * it lived only in the Products page's table), reusing the relationship
 * data FullDesign already carries, no new query.
 */
export function SkuPlacementLayer({ design, layout }: { design: FullDesign; layout: DesignLayout }) {
  const panelLayoutById = new Map<string, PanelLayout>(
    layout.zones.flatMap((z) => z.partitions.flatMap((p) => p.panels)).map((p) => [p.id, p]),
  );
  const instanceById = new Map(design.productInstances.map((i) => [i.id, i]));

  const badges: { key: string; x: number; y: number; label: string }[] = [];

  for (const rel of design.geometryProductRelationships) {
    const instance = instanceById.get(rel.productInstanceId);
    if (!instance?.sku) continue;

    if (rel.geometryNodeId) {
      const panel = panelLayoutById.get(rel.geometryNodeId);
      if (panel) {
        badges.push({
          key: rel.id,
          x: mmLengthToBasePx(panel.xMm) + 4,
          y: mmLengthToBasePx(panel.heightMm) - 14,
          label: instance.sku.code,
        });
      }
      continue;
    }

    if (rel.geometryEdgeId) {
      const ownerNode = design.geometryNodes.find((n) => n.edges.some((e) => e.id === rel.geometryEdgeId));
      const edge = ownerNode?.edges.find((e) => e.id === rel.geometryEdgeId);
      const panel = ownerNode ? panelLayoutById.get(ownerNode.id) : undefined;
      if (panel && edge) {
        const side = (edge.metadata as { side?: string } | null)?.side;
        const xMm = side === "end" ? panel.xMm + panel.widthMm : panel.xMm;
        badges.push({
          key: rel.id,
          x: mmLengthToBasePx(xMm) + 4,
          y: mmLengthToBasePx(panel.heightMm) / 2,
          label: instance.sku.code,
        });
      }
    }
  }

  return (
    <Layer listening={false}>
      {badges.map((b) => (
        <Text key={b.key} text={b.label} x={b.x} y={b.y} fontSize={9} fill="#0f766e" />
      ))}
    </Layer>
  );
}
