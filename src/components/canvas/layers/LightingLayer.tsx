"use client";

import { Fragment } from "react";
import { Layer, Circle, Text } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import type { DesignLayout } from "@/lib/canvas/layout";
import { mmLengthToBasePx } from "@/lib/canvas/coords";

/**
 * Cove-lighting instance markers (FUNCTIONAL category, non-null z). Position
 * comes from whichever zone/panel a GeometryProductRelationship attaches
 * the instance to -- an instance with no such relationship yet has nowhere
 * derivable to render and is simply skipped here (it still shows up in the
 * Products table); this is new visualization, not a regression, since the
 * old canvases never rendered lighting placement at all.
 */
export function LightingLayer({ design, layout }: { design: FullDesign; layout: DesignLayout }) {
  const zoneById = new Map(layout.zones.map((z) => [z.id, z]));
  const panelById = new Map(layout.zones.flatMap((z) => z.partitions.flatMap((p) => p.panels)).map((p) => [p.id, p]));
  const instanceById = new Map(design.productInstances.map((i) => [i.id, i]));

  const markers: { key: string; x: number; y: number; label: string }[] = [];

  for (const rel of design.geometryProductRelationships) {
    if (!rel.geometryNodeId) continue;
    const instance = instanceById.get(rel.productInstanceId);
    if (!instance?.sku || instance.sku.category.key !== "FUNCTIONAL" || instance.z == null) continue;

    const zone = zoneById.get(rel.geometryNodeId);
    if (zone) {
      markers.push({
        key: rel.id,
        x: mmLengthToBasePx(zone.xMm + zone.widthMm / 2),
        y: 10,
        label: instance.sku.code,
      });
      continue;
    }
    const panel = panelById.get(rel.geometryNodeId);
    if (panel) {
      markers.push({
        key: rel.id,
        x: mmLengthToBasePx(panel.xMm + panel.widthMm / 2),
        y: 10,
        label: instance.sku.code,
      });
    }
  }

  return (
    <Layer listening={false}>
      {markers.map((m) => (
        <Fragment key={m.key}>
          <Circle x={m.x} y={m.y} radius={4} fill="#eab308" />
          <Text text={m.label} x={m.x + 6} y={m.y - 6} fontSize={9} fill="#a16207" />
        </Fragment>
      ))}
    </Layer>
  );
}
