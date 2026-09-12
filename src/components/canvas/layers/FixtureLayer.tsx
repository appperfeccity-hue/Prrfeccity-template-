"use client";

import { Fragment } from "react";
import { Layer, Rect, Text } from "react-konva";
import type { FullDesign } from "@/lib/api/client";
import { basePxToMm, mmLengthToBasePx, mmToBasePx, snapMmPoint } from "@/lib/canvas/coords";
import type { CanvasSelection } from "@/lib/canvas/store";

// Penetrations (an opening in the wall structure) vs. surface-mount
// obstructions -- a rendering-only distinction (dashed vs. solid/tinted
// outline), never a schema field, since nothing downstream branches on it.
const PENETRATION_TYPES = new Set(["WINDOW", "DOOR"]);

/**
 * Customer/site elements (TV, AC unit, socket, window, door) that drive
 * placement/clearance constraints but never enter the Master BOM (see
 * validation rule 18, FIXTURE_CLEARANCE_OVERLAP, and src/lib/graph/bom.ts).
 * Unlike FurnitureLayer, Fixture.xMm/yMm are the TOP-LEFT corner of the
 * box (matching Wall/Zone/Partition/Panel's own left-edge convention), not
 * a center-anchored fixed-size marker -- a Fixture always has a real,
 * Designer-supplied width/height. No Transformer/rotate handle (rotation
 * is not modeled) and no resize handles (dimensions are set via creation
 * or the Inspector only).
 */
export function FixtureLayer({
  fixtures,
  selection,
  snapEnabled,
  onSelect,
  onMove,
}: {
  fixtures: FullDesign["fixtures"];
  selection: CanvasSelection;
  snapEnabled: boolean;
  onSelect?: (id: string) => void;
  onMove?: (fixtureId: string, xMm: number, yMm: number) => void;
}) {
  const selectedId = selection?.kind === "fixture" ? selection.id : null;

  return (
    <Layer>
      {fixtures.map((fx) => {
        const topLeftPx = mmToBasePx({ x: fx.xMm, y: fx.yMm });
        const widthPx = mmLengthToBasePx(fx.widthMm);
        const heightPx = mmLengthToBasePx(fx.heightMm);
        const isPenetration = PENETRATION_TYPES.has(fx.fixtureType);
        return (
          <Fragment key={fx.id}>
            <Rect
              id={fx.id}
              name="fixture"
              x={topLeftPx.x}
              y={topLeftPx.y}
              width={widthPx}
              height={heightPx}
              fill={isPenetration ? "transparent" : "#fde68a55"}
              stroke={selectedId === fx.id ? "#b45309" : "#92400e"}
              strokeWidth={selectedId === fx.id ? 2 : 1}
              dash={isPenetration ? [6, 4] : undefined}
              draggable
              onClick={(e) => {
                e.cancelBubble = true;
                onSelect?.(fx.id);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                onSelect?.(fx.id);
              }}
              onDragEnd={(e) => {
                const node = e.target;
                const mm = snapMmPoint(basePxToMm({ x: node.x(), y: node.y() }), snapEnabled);
                const snappedPx = mmToBasePx(mm);
                node.position(snappedPx);
                onMove?.(fx.id, mm.x, mm.y);
              }}
            />
            <Text
              text={fx.label ?? fx.fixtureType}
              x={topLeftPx.x}
              y={topLeftPx.y - 14}
              fontSize={11}
              fill="#92400e"
              listening={false}
            />
          </Fragment>
        );
      })}
    </Layer>
  );
}
