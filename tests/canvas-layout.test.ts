import { describe, expect, it } from "vitest";
import { computeZoneLayout, ZONE_GAP_MM } from "@/lib/canvas/layout";
import type { FullDesign } from "@/lib/api/client";
import type { WallModel } from "@/generated/prisma/models";

type Node = FullDesign["geometryNodes"][number];

function zoneNode(id: string, orderIndex: number, widthMm: number, heightMm = 2400): Node {
  return {
    id,
    nodeType: "ZONE",
    zone: { id, orderIndex, widthMm, heightMm, associatesWith: "WALL", hasCoveLighting: false },
  } as unknown as Node;
}

function partitionNode(id: string, zoneId: string, orderIndex: number, widthMm: number, heightMm = 2400): Node {
  return {
    id,
    nodeType: "PARTITION",
    partition: { id, zoneId, orderIndex, widthMm, heightMm },
  } as unknown as Node;
}

function panelNode(
  id: string,
  partitionId: string,
  orderIndex: number,
  widthMm: number,
  opts: { heightMm?: number; orientation?: "VERTICAL" | "HORIZONTAL"; isOffcut?: boolean } = {},
): Node {
  return {
    id,
    nodeType: "PANEL",
    panel: {
      id,
      partitionId,
      orderIndex,
      widthMm,
      heightMm: opts.heightMm ?? 2400,
      orientation: opts.orientation ?? "VERTICAL",
      isOffcut: opts.isOffcut ?? false,
    },
  } as unknown as Node;
}

const wall = { lengthMm: 3000, heightMm: 2400 } as unknown as WallModel;

describe("computeZoneLayout", () => {
  it("positions a single zone/partition/panel at the origin", () => {
    const nodes = [zoneNode("z1", 0, 1000), partitionNode("p1", "z1", 0, 1000), panelNode("panel1", "p1", 0, 600)];

    const layout = computeZoneLayout(nodes, wall);

    expect(layout.zones).toHaveLength(1);
    expect(layout.zones[0]).toMatchObject({ id: "z1", xMm: 0, widthMm: 1000 });
    expect(layout.zones[0].partitions[0]).toMatchObject({ id: "p1", xMm: 0, widthMm: 1000 });
    expect(layout.zones[0].partitions[0].panels[0]).toMatchObject({ id: "panel1", xMm: 0, widthMm: 600 });
  });

  it("lays out multiple zones left-to-right with ZONE_GAP_MM between them, ordered by orderIndex", () => {
    const nodes = [
      zoneNode("z2", 1, 800),
      zoneNode("z1", 0, 1000), // deliberately out of array order -- orderIndex must win
    ];

    const layout = computeZoneLayout(nodes, wall);

    expect(layout.zones.map((z) => z.id)).toEqual(["z1", "z2"]);
    expect(layout.zones[0].xMm).toBe(0);
    expect(layout.zones[1].xMm).toBe(1000 + ZONE_GAP_MM);
  });

  it("accumulates partition and panel x-offsets within their parent, independent of sibling zones", () => {
    const nodes = [
      zoneNode("z1", 0, 1200),
      partitionNode("p1", "z1", 0, 500),
      partitionNode("p2", "z1", 1, 700),
      panelNode("pan1", "p2", 0, 300),
      panelNode("pan2", "p2", 1, 400),
    ];

    const layout = computeZoneLayout(nodes, wall);
    const [p1, p2] = layout.zones[0].partitions;

    expect(p1.xMm).toBe(0);
    expect(p2.xMm).toBe(500);
    expect(p2.panels[0].xMm).toBe(500);
    expect(p2.panels[1].xMm).toBe(800);
  });

  it("preserves isOffcut/orientation fields on panels", () => {
    const nodes = [
      zoneNode("z1", 0, 700),
      partitionNode("p1", "z1", 0, 700),
      panelNode("pan1", "p1", 0, 600, { orientation: "HORIZONTAL" }),
      panelNode("pan2", "p1", 1, 100, { isOffcut: true }),
    ];

    const layout = computeZoneLayout(nodes, wall);
    const panels = layout.zones[0].partitions[0].panels;

    expect(panels[0]).toMatchObject({ orientation: "HORIZONTAL", isOffcut: false });
    expect(panels[1]).toMatchObject({ isOffcut: true });
  });

  it("totalWidthMm is at least the wall length even with no zones", () => {
    const layout = computeZoneLayout([], wall);
    expect(layout.zones).toHaveLength(0);
    expect(layout.totalWidthMm).toBe(3000);
  });

  it("totalWidthMm grows past the wall length if zones overflow it", () => {
    const nodes = [zoneNode("z1", 0, 5000)];
    const layout = computeZoneLayout(nodes, wall);
    expect(layout.totalWidthMm).toBe(5000);
  });
});
