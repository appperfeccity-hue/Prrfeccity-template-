"use client";

import { useRef, useState } from "react";
import { Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { FullDesign } from "@/lib/api/client";
import type { GeometryEdgeModel } from "@/generated/prisma/models";
import { computeZoneLayout } from "@/lib/canvas/layout";
import { basePxToMm, resolvePointerMm, snapMmPoint, type MmPoint } from "@/lib/canvas/coords";
import { fitToContent, actualSize, zoomAtPoint } from "@/lib/canvas/viewport";
import { useCanvasStore } from "@/lib/canvas/store";
import { SKU_DRAG_MIME, type SkuDragPayload } from "@/components/palette/SkuPalette";
import { GridLayer } from "@/components/canvas/layers/GridLayer";
import { WallOutlineLayer } from "@/components/canvas/layers/WallOutlineLayer";
import { ZonesLayer } from "@/components/canvas/layers/ZonesLayer";
import { SkuPlacementLayer } from "@/components/canvas/layers/SkuPlacementLayer";
import { LightingLayer } from "@/components/canvas/layers/LightingLayer";
import { FurnitureLayer } from "@/components/canvas/layers/FurnitureLayer";
import { FixtureLayer } from "@/components/canvas/layers/FixtureLayer";
import { TrimsLayer } from "@/components/canvas/layers/TrimsLayer";
import { MeasurementsLayer } from "@/components/canvas/layers/MeasurementsLayer";
import { SelectionLayer } from "@/components/canvas/layers/SelectionLayer";
import { GridOverlayLayer } from "@/components/canvas/layers/GridOverlayLayer";
import { ConstraintLayer } from "@/components/canvas/layers/ConstraintLayer";
import { GeometryPrimitiveLayer } from "@/components/canvas/layers/GeometryPrimitiveLayer";
import type { CanvasSelectionItem } from "@/lib/canvas/store";

export type DesignStageDropTarget =
  | { kind: "partition"; id: string }
  | { kind: "panel"; id: string }
  | { kind: "edge"; id: string };

export type ConstraintTargetRef = {
  kind: "FIXTURE" | "PRODUCT_INSTANCE" | "GEOMETRY_NODE" | "GEOMETRY_EDGE";
  id: string;
};

// wall/zone/partition/panel all share their PK with a GeometryNode row (see
// prisma/schema.prisma) -- they all resolve to a GEOMETRY_NODE Constraint
// target. "edge" resolves to GEOMETRY_EDGE; "instance"/"fixture" resolve to
// their own freestanding kinds directly.
function canvasItemToConstraintTarget(item: CanvasSelectionItem): ConstraintTargetRef {
  switch (item.kind) {
    case "wall":
    case "zone":
    case "partition":
    case "panel":
    // A geometry primitive also shares its PK with a GeometryNode row, so it
    // converts the same way -- assertWallAnchor (src/lib/graph/constraint.ts)
    // rejects it server-side with a 400, since Constraint anchors are scoped
    // to WALL-owned GeometryNodes only this pass (see Phase 6 item 1's Key
    // design decision #5: primitives are anchor-compatible in shape, but
    // wiring assertWallAnchor -> assertAnchorableGeometry is deferred).
    case "primitive":
      return { kind: "GEOMETRY_NODE", id: item.id };
    case "edge":
      return { kind: "GEOMETRY_EDGE", id: item.id };
    case "instance":
      return { kind: "PRODUCT_INSTANCE", id: item.id };
    case "fixture":
      return { kind: "FIXTURE", id: item.id };
    case "constraint":
      // Not a valid Constraint endpoint -- a constraint can't target another
      // constraint. Unreachable in practice (ConstraintLayer's own click
      // handler never fires while pickTarget is armed), kept exhaustive
      // rather than throwing so this stays a total function.
      return { kind: "GEOMETRY_NODE", id: item.id };
  }
}

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 600;
const ZOOM_FACTOR = 1.1;

/**
 * The unified interactive canvas (UI-M4). One Konva Stage, one mm coordinate
 * system (via src/lib/canvas/{layout,coords,viewport}.ts), zoom/pan/selection
 * driven by the shared canvas store (src/lib/canvas/store.tsx).
 *
 * DesignStage does no domain computation itself -- computeZoneLayout (pure
 * mm geometry) and every mutation callback below are owned elsewhere and
 * reused unchanged; this component only converts between screen/mm space
 * and dispatches to those existing callbacks, mirroring exactly what
 * WallCanvas/ZoneCanvas/FurnitureCanvas used to do individually.
 *
 * Authoritative layer order: Grid, Wall, Zones, SKU placement, Lighting,
 * Fixture, Furniture, Trims, Constraint, GeometryPrimitive, Measurements,
 * Selection, Grid overlay. While `pickTarget` is set (a Constraint's target A/B is being
 * picked), every layer's onSelect (and onSelectEdge) callback resolves
 * through `handleSelect`, which routes to `pickTarget` instead of the canvas
 * store's own `select` -- see ConstraintLayer/ConstraintPalette for the
 * authoring flow this feeds.
 */
export function DesignStage({
  design,
  onSelectEdge,
  onDropSku,
  onResizePanel,
  onRotatePanel,
  onPlaceFurniture,
  onMoveFurniture,
  onRotateFurniture,
  onPlaceFixture,
  onMoveFixture,
  pickTarget,
}: {
  design: FullDesign;
  onSelectEdge?: (edge: GeometryEdgeModel) => void;
  onDropSku?: (payload: SkuDragPayload, target: DesignStageDropTarget | null, mm: MmPoint) => void;
  onResizePanel?: (panelId: string, widthMm: number) => void;
  onRotatePanel?: (panelId: string, orientation: "VERTICAL" | "HORIZONTAL") => void;
  onPlaceFurniture?: (xMm: number, yMm: number) => void;
  onMoveFurniture?: (instanceId: string, xMm: number, yMm: number) => void;
  onRotateFurniture?: (instanceId: string, rotationDeg: number) => void;
  onPlaceFixture?: (xMm: number, yMm: number) => void;
  onMoveFixture?: (fixtureId: string, xMm: number, yMm: number) => void;
  // Set only while a Constraint pick is in progress -- when present, every
  // click that would normally select an item instead resolves target A/B
  // for the armed Constraint and does NOT write to the store's selection.
  pickTarget?: (ref: ConstraintTargetRef) => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPreviewMm, setDragPreviewMm] = useState<MmPoint | null>(null);
  const { selection, activeTool, viewport, layerVisibility, snapEnabled, activeSegmentId, select, setViewport } = useCanvasStore();

  const handleSelect = (item: CanvasSelectionItem) => {
    if (pickTarget) {
      pickTarget(canvasItemToConstraintTarget(item));
      return;
    }
    select(item);
  };

  // No true 2D bent rendering this pass -- each segment renders its own flat
  // elevation; the segment tab bar (DesignStageSection) switches which one
  // is active via the shared canvas store.
  const segmentNodes = design.geometryNodes
    .filter((n) => n.nodeType === "WALL" && n.wallSegment)
    .sort((a, b) => a.wallSegment!.sequence - b.wallSegment!.sequence);
  const activeSegmentNode = segmentNodes.find((n) => n.id === activeSegmentId) ?? segmentNodes[0];
  const layout = computeZoneLayout(design.geometryNodes, activeSegmentNode?.wallSegment);
  // Fixtures/furniture with no wallSegmentId (unscoped, e.g. rows created
  // before this pass) render on every segment's tab; segment-scoped rows
  // render only on their own segment's tab -- matches rule 18's own
  // "unscoped" bucketing in validation.ts.
  const activeFixtures = design.fixtures.filter(
    (fx) => fx.wallSegmentId == null || fx.wallSegmentId === activeSegmentNode?.id,
  );
  const furnitureInstances = design.productInstances.filter(
    (pi) =>
      pi.sku?.category.key === "FURNITURE" &&
      (pi.wallSegmentId == null || pi.wallSegmentId === activeSegmentNode?.id),
  );

  if (!activeSegmentNode?.wallSegment) {
    return <p>Configure the first wall segment first.</p>;
  }
  const wall = activeSegmentNode.wallSegment;
  const contentHeightMm = wall.heightMm;

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const factor = e.evt.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    setViewport(zoomAtPoint(viewport, pointer, factor));
  };

  const handleStageDragEnd = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return;
    setViewport({ ...viewport, panX: e.target.x(), panY: e.target.y() });
  };

  const handleStageClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target !== e.target.getStage()) return;
    // An empty-canvas click while a Constraint pick is armed does nothing
    // and stays armed -- there is no "target" to resolve from empty space.
    if (!pickTarget) select(null);
    const stage = e.target.getStage();
    const relative = stage?.getRelativePointerPosition();
    if (!relative) return;
    const mm = snapMmPoint(basePxToMm(relative), snapEnabled);
    // Both callbacks self-guard on their own arm-state at the call site,
    // and arming one always clears the other, so at most one ever fires.
    onPlaceFurniture?.(mm.x, mm.y);
    onPlaceFixture?.(mm.x, mm.y);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
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
    if (!stage || !container || !onDropSku) return;
    const rect = container.getBoundingClientRect();
    const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const shape = stage.getIntersection(screenPos);
    const mm = resolvePointerMm(screenPos, viewport, snapEnabled);

    const name = shape?.name();
    const id = shape?.id();
    if (id && (name === "partition" || name === "panel" || name === "edge")) {
      onDropSku(payload, { kind: name, id }, mm);
    } else {
      onDropSku(payload, null, mm);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <button className="btn btn-secondary" onClick={() => setViewport(zoomAtPoint(viewport, { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 }, ZOOM_FACTOR))}>
          Zoom In
        </button>
        <button className="btn btn-secondary" onClick={() => setViewport(zoomAtPoint(viewport, { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 }, 1 / ZOOM_FACTOR))}>
          Zoom Out
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            setViewport(
              fitToContent(
                { width: layout.totalWidthMm * 0.2, height: contentHeightMm * 0.2 },
                { width: STAGE_WIDTH, height: STAGE_HEIGHT },
              ),
            )
          }
        >
          Fit design
        </button>
        <button className="btn btn-secondary" onClick={() => setViewport(actualSize())}>
          100%
        </button>
        <span className="text-foreground/40">{Math.round(viewport.scale * 100)}%</span>
      </div>
      <div
        ref={containerRef}
        className="canvas-wrap"
        style={{ cursor: activeTool === "pan" ? "grab" : "default" }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Stage
          ref={stageRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          x={viewport.panX}
          y={viewport.panY}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          draggable={activeTool === "pan"}
          onWheel={handleWheel}
          onDragEnd={handleStageDragEnd}
          onClick={handleStageClick}
          onTap={handleStageClick}
        >
          {layerVisibility.grid && <GridLayer widthMm={layout.totalWidthMm} heightMm={contentHeightMm} />}

          <WallOutlineLayer
            wall={wall}
            edges={activeSegmentNode.edges}
            selection={selection}
            onSelectWall={() => handleSelect({ kind: "wall", id: wall.id })}
          />

          <ZonesLayer
            layout={layout}
            selection={selection}
            onSelectZone={(id) => handleSelect({ kind: "zone", id })}
            onSelectPartition={(id) => handleSelect({ kind: "partition", id })}
            onSelectPanel={(id) => handleSelect({ kind: "panel", id })}
          />

          <SkuPlacementLayer design={design} layout={layout} />

          {layerVisibility.dependencies && <LightingLayer design={design} layout={layout} />}

          {layerVisibility.fixtures && (
            <FixtureLayer
              fixtures={activeFixtures}
              selection={selection}
              snapEnabled={snapEnabled}
              onSelect={(id) => handleSelect({ kind: "fixture", id })}
              onMove={onMoveFixture}
            />
          )}

          {layerVisibility.furniture && (
            <FurnitureLayer
              instances={furnitureInstances}
              selection={selection}
              snapEnabled={snapEnabled}
              onSelect={(id) => handleSelect({ kind: "instance", id })}
              onMove={onMoveFurniture}
              onRotate={onRotateFurniture}
              onDragPreview={setDragPreviewMm}
            />
          )}

          <TrimsLayer
            design={design}
            layout={layout}
            selection={selection}
            onSelectEdge={(edge) => {
              handleSelect({ kind: "edge", id: edge.id });
              if (!pickTarget) onSelectEdge?.(edge);
            }}
          />

          {layerVisibility.constraints && (
            <ConstraintLayer
              constraints={design.constraints}
              design={design}
              activeSegmentId={activeSegmentNode.id}
              selection={selection}
              onSelect={(id) => handleSelect({ kind: "constraint", id })}
            />
          )}

          {layerVisibility.geometryPrimitives && (
            <GeometryPrimitiveLayer
              design={design}
              selection={selection}
              onSelect={(id) => handleSelect({ kind: "primitive", id })}
            />
          )}

          <MeasurementsLayer viewport={viewport} containerHeight={STAGE_HEIGHT} />

          <SelectionLayer layout={layout} selection={selection} onResizePanel={onResizePanel} onRotatePanel={onRotatePanel} />

          <GridOverlayLayer snappedMm={dragPreviewMm} />
        </Stage>
      </div>
    </div>
  );
}
