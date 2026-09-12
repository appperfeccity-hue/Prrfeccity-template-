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

export type DesignStageDropTarget =
  | { kind: "partition"; id: string }
  | { kind: "panel"; id: string }
  | { kind: "edge"; id: string };

const STAGE_WIDTH = 960;
const STAGE_HEIGHT = 600;
const ZOOM_FACTOR = 1.1;

/**
 * The unified interactive canvas (UI-M4). One Konva Stage, one mm coordinate
 * system (via src/lib/canvas/{layout,coords,viewport}.ts), zoom/pan/selection
 * driven by the shared canvas store (src/lib/canvas/store.tsx). Renders in
 * the authoritative layer order: Grid, Wall, Zones, SKU placement, Lighting,
 * Furniture, Trims, Measurements, Selection, Grid overlay.
 *
 * DesignStage does no domain computation itself -- computeZoneLayout (pure
 * mm geometry) and every mutation callback below are owned elsewhere and
 * reused unchanged; this component only converts between screen/mm space
 * and dispatches to those existing callbacks, mirroring exactly what
 * WallCanvas/ZoneCanvas/FurnitureCanvas used to do individually.
 *
 * Authoritative layer order: Grid, Wall, Zones, SKU placement, Lighting,
 * Fixture, Furniture, Trims, Measurements, Selection, Grid overlay.
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
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragPreviewMm, setDragPreviewMm] = useState<MmPoint | null>(null);
  const { selection, activeTool, viewport, layerVisibility, snapEnabled, select, setViewport } = useCanvasStore();

  const wallNode = design.geometryNodes.find((n) => n.nodeType === "WALL");
  const layout = computeZoneLayout(design.geometryNodes, wallNode?.wall);
  const furnitureInstances = design.productInstances.filter((pi) => pi.sku?.category.key === "FURNITURE");

  if (!wallNode?.wall) {
    return <p>Configure the wall first.</p>;
  }
  const wall = wallNode.wall;
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
    select(null);
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
            edges={wallNode.edges}
            selection={selection}
            onSelectWall={() => select({ kind: "wall", id: wall.id })}
          />

          <ZonesLayer
            layout={layout}
            selection={selection}
            onSelectZone={(id) => select({ kind: "zone", id })}
            onSelectPartition={(id) => select({ kind: "partition", id })}
            onSelectPanel={(id) => select({ kind: "panel", id })}
          />

          <SkuPlacementLayer design={design} layout={layout} />

          {layerVisibility.dependencies && <LightingLayer design={design} layout={layout} />}

          {layerVisibility.fixtures && (
            <FixtureLayer
              fixtures={design.fixtures}
              selection={selection}
              snapEnabled={snapEnabled}
              onSelect={(id) => select({ kind: "fixture", id })}
              onMove={onMoveFixture}
            />
          )}

          {layerVisibility.furniture && (
            <FurnitureLayer
              instances={furnitureInstances}
              selection={selection}
              snapEnabled={snapEnabled}
              onSelect={(id) => select({ kind: "instance", id })}
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
              select({ kind: "edge", id: edge.id });
              onSelectEdge?.(edge);
            }}
          />

          <MeasurementsLayer viewport={viewport} containerHeight={STAGE_HEIGHT} />

          <SelectionLayer layout={layout} selection={selection} onResizePanel={onResizePanel} onRotatePanel={onRotatePanel} />

          <GridOverlayLayer snappedMm={dragPreviewMm} />
        </Stage>
      </div>
    </div>
  );
}
