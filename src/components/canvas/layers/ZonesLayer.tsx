"use client";

import { Layer, Rect, Text } from "react-konva";
import type { DesignLayout } from "@/lib/canvas/layout";
import { mmLengthToBasePx } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

const LABEL_H_PX = 18;

/**
 * Zone/partition/panel rects + labels, positioned from computeZoneLayout's
 * pure mm output (src/lib/canvas/layout.ts) -- this layer does no geometry
 * math of its own, only unit conversion (mm -> base px) and drawing.
 */
export function ZonesLayer({
  layout,
  selection,
  onSelectZone,
  onSelectPartition,
  onSelectPanel,
}: {
  layout: DesignLayout;
  selection: CanvasSelection;
  onSelectZone?: (id: string) => void;
  onSelectPartition?: (id: string) => void;
  onSelectPanel?: (id: string) => void;
}) {
  return (
    <Layer>
      {layout.zones.map((zone) => {
        const zoneXPx = mmLengthToBasePx(zone.xMm);
        const zoneWPx = mmLengthToBasePx(zone.widthMm);
        const zoneHPx = mmLengthToBasePx(zone.heightMm);
        const zoneSelected = selection?.kind === "zone" && selection.id === zone.id;

        return (
          <Rect
            key={zone.id}
            id={zone.id}
            name="zone"
            x={zoneXPx}
            y={0}
            width={zoneWPx}
            height={zoneHPx}
            stroke={zoneSelected ? "#2563eb" : "#a3a3a3"}
            strokeWidth={zoneSelected ? 2.5 : 1}
            fill="rgba(37,99,235,0.03)"
            onClick={() => onSelectZone?.(zone.id)}
            onTap={() => onSelectZone?.(zone.id)}
          />
        );
      })}

      {layout.zones.flatMap((zone) =>
        zone.partitions.map((partition) => {
          const partitionXPx = mmLengthToBasePx(partition.xMm);
          const partitionWPx = mmLengthToBasePx(partition.widthMm);
          const partitionHPx = mmLengthToBasePx(partition.heightMm);
          const partitionSelected = selection?.kind === "partition" && selection.id === partition.id;
          const empty = partition.panels.length === 0;

          return (
            <Rect
              key={partition.id}
              id={partition.id}
              name="partition"
              x={partitionXPx}
              y={0}
              width={partitionWPx}
              height={partitionHPx}
              stroke={partitionSelected ? "#2563eb" : "#a5b4fc"}
              strokeWidth={partitionSelected ? 2.5 : 1}
              dash={empty ? [4, 3] : undefined}
              fill={empty ? "rgba(165,180,252,0.08)" : "transparent"}
              onClick={() => onSelectPartition?.(partition.id)}
              onTap={() => onSelectPartition?.(partition.id)}
            />
          );
        }),
      )}

      {layout.zones.flatMap((zone) =>
        zone.partitions.flatMap((partition) =>
          partition.panels.map((panel) => {
            const panelXPx = mmLengthToBasePx(panel.xMm);
            const panelWPx = mmLengthToBasePx(panel.widthMm);
            const panelHPx = mmLengthToBasePx(panel.heightMm);
            const panelSelected = selection?.kind === "panel" && selection.id === panel.id;

            return (
              <Rect
                key={panel.id}
                id={panel.id}
                name="panel"
                x={panelXPx}
                y={0}
                width={panelWPx}
                height={panelHPx}
                stroke={panelSelected ? "#2563eb" : panel.isOffcut ? "#f59e0b" : "#bbb"}
                strokeWidth={panelSelected ? 2.5 : 1}
                fill={panel.isOffcut ? "#fffbeb" : "#fafafa"}
                onClick={() => onSelectPanel?.(panel.id)}
                onTap={() => onSelectPanel?.(panel.id)}
              />
            );
          }),
        ),
      )}

      {layout.zones.map((zone) => (
        <Text
          key={`${zone.id}-label`}
          text={`Zone ${zone.orderIndex} (${zone.associatesWith}${zone.hasCoveLighting ? ", cove light" : ""})`}
          x={mmLengthToBasePx(zone.xMm)}
          y={-LABEL_H_PX}
          fontSize={11}
          fill="#333"
          listening={false}
        />
      ))}

      {layout.zones.flatMap((zone) =>
        zone.partitions.flatMap((partition) =>
          partition.panels.map((panel) => (
            <Text
              key={`${panel.id}-label`}
              text={`P${panel.orderIndex} · ${panel.orientation === "VERTICAL" ? "V" : "H"}${panel.isOffcut ? " (offcut)" : ""}`}
              x={mmLengthToBasePx(panel.xMm) + 4}
              y={4}
              fontSize={9}
              fill={panel.isOffcut ? "#b45309" : "#999"}
              listening={false}
            />
          )),
        ),
      )}
    </Layer>
  );
}
