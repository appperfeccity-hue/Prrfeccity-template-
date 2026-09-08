import type { FullDesign } from "@/lib/api/client";
import type { WallModel } from "@/generated/prisma/models";

type Node = FullDesign["geometryNodes"][number];

/** Gap between adjacent zones, in mm. Matches the pixel gap ZoneCanvas used
 * to draw (12px) at its old SCALE=0.2 (12 / 0.2 = 60mm), so a layout computed
 * here renders identically once DesignStage applies the shared mm->px scale. */
export const ZONE_GAP_MM = 60;

export type PanelLayout = {
  id: string;
  xMm: number;
  widthMm: number;
  heightMm: number;
  orderIndex: number;
  orientation: "VERTICAL" | "HORIZONTAL";
  isOffcut: boolean;
};

export type PartitionLayout = {
  id: string;
  xMm: number;
  widthMm: number;
  heightMm: number;
  orderIndex: number;
  panels: PanelLayout[];
};

export type ZoneLayout = {
  id: string;
  xMm: number;
  widthMm: number;
  heightMm: number;
  orderIndex: number;
  associatesWith: string;
  hasCoveLighting: boolean;
  partitions: PartitionLayout[];
};

export type DesignLayout = {
  zones: ZoneLayout[];
  totalWidthMm: number;
};

/**
 * Derives real-world (mm) positions for zones/partitions/panels from their
 * orderIndex + widthMm -- there are no xMm/yMm columns on these models, so
 * position is always computed, never stored. Ports the left-to-right cursor
 * accumulation ZoneCanvas.tsx used to do directly in pixels (cursorX /
 * partitionCursor / panelCursor) into pure mm math, decoupled from any
 * particular pixel scale or React/Konva rendering.
 */
export function computeZoneLayout(nodes: Node[], wall: WallModel | null | undefined): DesignLayout {
  const zoneNodes = nodes
    .filter((n) => n.nodeType === "ZONE" && n.zone)
    .sort((a, b) => a.zone!.orderIndex - b.zone!.orderIndex);

  const partitionsForZone = (zoneId: string) =>
    nodes
      .filter((n) => n.nodeType === "PARTITION" && n.partition?.zoneId === zoneId)
      .sort((a, b) => a.partition!.orderIndex - b.partition!.orderIndex);

  const panelsForPartition = (partitionId: string) =>
    nodes
      .filter((n) => n.nodeType === "PANEL" && n.panel?.partitionId === partitionId)
      .sort((a, b) => a.panel!.orderIndex - b.panel!.orderIndex);

  let cursorX = 0;
  const zones: ZoneLayout[] = zoneNodes.map((zoneNode) => {
    const zone = zoneNode.zone!;
    const zoneX = cursorX;
    cursorX += zone.widthMm + ZONE_GAP_MM;

    let partitionCursor = zoneX;
    const partitions: PartitionLayout[] = partitionsForZone(zoneNode.id).map((partitionNode) => {
      const partition = partitionNode.partition!;
      const partitionX = partitionCursor;
      partitionCursor += partition.widthMm;

      let panelCursor = partitionX;
      const panels: PanelLayout[] = panelsForPartition(partitionNode.id).map((panelNode) => {
        const panel = panelNode.panel!;
        const panelX = panelCursor;
        panelCursor += panel.widthMm;
        return {
          id: panelNode.id,
          xMm: panelX,
          widthMm: panel.widthMm,
          heightMm: panel.heightMm,
          orderIndex: panel.orderIndex,
          orientation: panel.orientation,
          isOffcut: panel.isOffcut,
        };
      });

      return {
        id: partitionNode.id,
        xMm: partitionX,
        widthMm: partition.widthMm,
        heightMm: partition.heightMm,
        orderIndex: partition.orderIndex,
        panels,
      };
    });

    return {
      id: zoneNode.id,
      xMm: zoneX,
      widthMm: zone.widthMm,
      heightMm: zone.heightMm,
      orderIndex: zone.orderIndex,
      associatesWith: zone.associatesWith,
      hasCoveLighting: zone.hasCoveLighting,
      partitions,
    };
  });

  const totalWidthMm = Math.max(wall?.lengthMm ?? 0, cursorX > 0 ? cursorX - ZONE_GAP_MM : 0);

  return { zones, totalWidthMm };
}
