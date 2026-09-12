"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useUndoRedo } from "@/lib/undo-redo";
import { useCanvasStore } from "@/lib/canvas/store";
import { useKeyboardShortcuts } from "@/lib/canvas/keyboard";
import {
  buildFixtureUpdateInput,
  buildInstanceMoveInput,
  buildInstanceOptionsInput,
  buildInstanceQuantityInput,
  buildInstanceRotateInput,
  buildPanelResizeInput,
  buildPanelRotateInput,
  type FixtureFields,
  type InstanceOptionIds,
} from "@/lib/canvas/mutations";
import { DesignStage, type DesignStageDropTarget } from "@/components/canvas/DesignStage";
import { Inspector } from "@/components/inspector/Inspector";
import { SkuPalette, type SkuDragPayload } from "@/components/palette/SkuPalette";
import { FurnitureCatalogue, type ArmedFurniture } from "@/components/palette/FurnitureCatalogue";
import { FixturePalette, type ArmedFixture } from "@/components/palette/FixturePalette";
import { ConstraintPalette, type ArmedConstraint, type ConstraintConfig } from "@/components/palette/ConstraintPalette";
import { GeometryPrimitivePalette } from "@/components/palette/GeometryPrimitivePalette";
import type { ConstraintTargetInput, ConstraintTypeValue } from "@/lib/api/client";

const DROP_RELATIONSHIP_TYPES = ["HAS_TREATMENT", "SUPPORTS", "TERMINATES", "BOUNDARY_OF", "POSITIONED_AT", "ADJACENT_TO"];

/**
 * UI-M6b: the unified DesignStage + generalized Inspector is now the sole
 * authoring surface for panel resize/rotate, auto-fill, drag-a-SKU-onto-a-
 * geometry-target linking, and furniture placement/move/rotate/options --
 * the old ZonesSection/FurnitureSection that used to duplicate this were
 * removed once parity was verified (see WallFormPanel/CreatePanel/
 * ProductLinking for the wall/creation/freestanding-placement pieces that
 * live alongside this component).
 *
 * Every resize/rotate/move/quantity mutation is built from the shared pure
 * functions in src/lib/canvas/mutations.ts and called from exactly one
 * useMutation instance per kind of edit -- both DesignStage's own
 * interactions (drag/click) and the Inspector's input fields invoke the
 * same callback, so there is exactly one code path per mutation, never two
 * competing ones.
 */
export function DesignStageSection({ designId: id }: { designId: string }) {
  const queryClient = useQueryClient();
  const { pushAction } = useUndoRedo();
  const { selection, clearSelection, activeSegmentId, setActiveSegment } = useCanvasStore();
  useKeyboardShortcuts();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const skusQuery = useQuery({ queryKey: ["skus"], queryFn: () => api.listSkus() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["design", id] });
  const design = designQuery.data;
  const isDraft = design?.status === "DRAFT";

  const [pendingDrop, setPendingDrop] = useState<{ payload: SkuDragPayload; target: { kind: "panel" | "edge"; id: string } } | null>(null);
  const [dropRelationshipType, setDropRelationshipType] = useState(DROP_RELATIONSHIP_TYPES[0]);
  const [armedFurniture, setArmedFurniture] = useState<ArmedFurniture | null>(null);
  const [armedFixture, setArmedFixture] = useState<ArmedFixture | null>(null);
  const [armedConstraint, setArmedConstraint] = useState<ArmedConstraint | null>(null);
  const furnitureSkus = (skusQuery.data ?? []).filter((s) => s.category.key === "FURNITURE");
  const nonFurnitureSkus = (skusQuery.data ?? []).filter((s) => s.category.key !== "FURNITURE");

  const resizePanelMutation = useMutation({
    mutationFn: (input: ReturnType<typeof buildPanelResizeInput>) => api.updatePanel(id, input.panelId, { widthMm: input.widthMm }),
    onSuccess: (_result, input) => {
      invalidate();
      pushAction({
        description: `Resize panel to ${input.widthMm}mm`,
        undo: async () => {
          await api.updatePanel(id, input.panelId, { widthMm: input.previousWidthMm });
          invalidate();
        },
        redo: async () => {
          await api.updatePanel(id, input.panelId, { widthMm: input.widthMm });
          invalidate();
        },
      });
    },
  });

  const rotatePanelMutation = useMutation({
    mutationFn: (input: ReturnType<typeof buildPanelRotateInput>) => api.updatePanel(id, input.panelId, { orientation: input.orientation }),
    onSuccess: (_result, input) => {
      invalidate();
      pushAction({
        description: `Rotate panel to ${input.orientation}`,
        undo: async () => {
          await api.updatePanel(id, input.panelId, { orientation: input.previousOrientation });
          invalidate();
        },
        redo: async () => {
          await api.updatePanel(id, input.panelId, { orientation: input.orientation });
          invalidate();
        },
      });
    },
  });

  const autoFillMutation = useMutation({
    mutationFn: ({ partitionId, skuId }: { partitionId: string; skuId: string }) =>
      api.autoFillPartition(id, partitionId, skuId),
    onSuccess: (result, variables) => {
      invalidate();
      let currentPanels = result.panels.map((p) => ({ panelId: p.panel.id, productInstanceId: p.productInstance?.id ?? null }));
      pushAction({
        description: `Auto-fill partition (${result.fill.count} panels)`,
        undo: async () => {
          for (const p of currentPanels) {
            if (p.productInstanceId) await api.deleteProductInstance(id, p.productInstanceId);
            await api.deleteGeometryNode(id, p.panelId);
          }
          invalidate();
        },
        redo: async () => {
          const r = await api.autoFillPartition(id, variables.partitionId, variables.skuId);
          currentPanels = r.panels.map((p) => ({ panelId: p.panel.id, productInstanceId: p.productInstance?.id ?? null }));
          invalidate();
        },
      });
    },
  });

  const linkDropMutation = useMutation({
    mutationFn: async (input: { skuId: string; target: { kind: "panel" | "edge"; id: string }; relationshipType: string }) => {
      const instance = await api.createProductInstance(id, { skuId: input.skuId });
      const relationship = await api.createGeometryProductRelationship(id, {
        geometryEdgeId: input.target.kind === "edge" ? input.target.id : undefined,
        geometryNodeId: input.target.kind === "panel" ? input.target.id : undefined,
        productInstanceId: instance.id,
        relationshipType: input.relationshipType,
      });
      return { instance, relationship };
    },
    onSuccess: (result, input) => {
      setPendingDrop(null);
      invalidate();
      let currentInstanceId = result.instance.id;
      let currentRelationshipId = result.relationship.id;
      pushAction({
        description: `Link dropped SKU (${input.relationshipType})`,
        undo: async () => {
          await api.deleteGeometryProductRelationship(id, currentRelationshipId);
          await api.deleteProductInstance(id, currentInstanceId);
          invalidate();
        },
        redo: async () => {
          const instance = await api.createProductInstance(id, { skuId: input.skuId });
          const relationship = await api.createGeometryProductRelationship(id, {
            geometryEdgeId: input.target.kind === "edge" ? input.target.id : undefined,
            geometryNodeId: input.target.kind === "panel" ? input.target.id : undefined,
            productInstanceId: instance.id,
            relationshipType: input.relationshipType,
          });
          currentInstanceId = instance.id;
          currentRelationshipId = relationship.id;
          invalidate();
        },
      });
    },
  });

  const placeFurnitureMutation = useMutation({
    mutationFn: (variables: ArmedFurniture & { x: number; y: number; wallSegmentId?: string }) =>
      api.createProductInstance(id, variables),
    onSuccess: (result, variables) => {
      invalidate();
      setArmedFurniture(null);
      let currentId = result.id;
      pushAction({
        description: `Place furniture`,
        undo: async () => {
          await api.deleteProductInstance(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createProductInstance(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  const moveFurnitureMutation = useMutation({
    mutationFn: (input: ReturnType<typeof buildInstanceMoveInput>) => api.updateProductInstance(id, input.instanceId, { x: input.x, y: input.y }),
    onSuccess: (_result, input) => {
      invalidate();
      pushAction({
        description: `Move furniture`,
        undo: async () => {
          await api.updateProductInstance(id, input.instanceId, { x: input.previousX, y: input.previousY });
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, input.instanceId, { x: input.x, y: input.y });
          invalidate();
        },
      });
    },
  });

  const rotateFurnitureMutation = useMutation({
    mutationFn: (input: ReturnType<typeof buildInstanceRotateInput>) => api.updateProductInstance(id, input.instanceId, { rotationDeg: input.rotationDeg }),
    onSuccess: (_result, input) => {
      invalidate();
      pushAction({
        description: `Rotate furniture`,
        undo: async () => {
          await api.updateProductInstance(id, input.instanceId, { rotationDeg: input.previousRotationDeg });
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, input.instanceId, { rotationDeg: input.rotationDeg });
          invalidate();
        },
      });
    },
  });

  const updateQuantityMutation = useMutation({
    mutationFn: (input: ReturnType<typeof buildInstanceQuantityInput>) => api.updateProductInstance(id, input.instanceId, { quantity: input.quantity }),
    onSuccess: (_result, input) => {
      invalidate();
      pushAction({
        description: `Set quantity to ${input.quantity}`,
        undo: async () => {
          await api.updateProductInstance(id, input.instanceId, { quantity: input.previousQuantity });
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, input.instanceId, { quantity: input.quantity });
          invalidate();
        },
      });
    },
  });

  const updateZMutation = useMutation({
    mutationFn: ({ instanceId, z }: { instanceId: string; z: number; previousZ: number }) =>
      api.updateProductInstance(id, instanceId, { z }),
    onSuccess: (_result, variables) => {
      invalidate();
      pushAction({
        description: `Set Z to ${variables.z}mm`,
        undo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { z: variables.previousZ });
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { z: variables.z });
          invalidate();
        },
      });
    },
  });

  const updateInstanceOptionsMutation = useMutation({
    mutationFn: (input: ReturnType<typeof buildInstanceOptionsInput>) =>
      api.updateProductInstance(id, input.instanceId, input.next),
    onSuccess: (_result, input) => {
      invalidate();
      pushAction({
        description: `Change furniture configuration`,
        undo: async () => {
          await api.updateProductInstance(id, input.instanceId, input.previous);
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, input.instanceId, input.next);
          invalidate();
        },
      });
    },
  });

  const createFixtureMutation = useMutation({
    mutationFn: (variables: ArmedFixture & { xMm: number; yMm: number; wallSegmentId?: string }) => api.createFixture(id, variables),
    onSuccess: (result, variables) => {
      invalidate();
      setArmedFixture(null);
      let currentId = result.id;
      pushAction({
        description: `Place fixture (${variables.fixtureType})`,
        undo: async () => {
          await api.deleteFixture(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createFixture(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  const updateFixtureMutation = useMutation({
    mutationFn: (input: ReturnType<typeof buildFixtureUpdateInput>) => api.updateFixture(id, input.fixtureId, input.next),
    onSuccess: (_result, input) => {
      invalidate();
      pushAction({
        description: `Update fixture`,
        undo: async () => {
          await api.updateFixture(id, input.fixtureId, input.previous);
          invalidate();
        },
        redo: async () => {
          await api.updateFixture(id, input.fixtureId, input.next);
          invalidate();
        },
      });
    },
  });

  const createConstraintMutation = useMutation({
    mutationFn: (variables: {
      constraintType: ConstraintTypeValue;
      targetA: ConstraintTargetInput;
      targetB?: ConstraintTargetInput | null;
      axis: ConstraintConfig["axis"];
      valueMm?: number;
      minValueMm?: number;
      maxValueMm?: number;
    }) => api.createConstraint(id, variables),
    onSuccess: (result, variables) => {
      invalidate();
      setArmedConstraint(null);
      let currentId = result.id;
      pushAction({
        description: `Add ${variables.constraintType} constraint`,
        undo: async () => {
          await api.deleteConstraint(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createConstraint(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  const createGeometryPrimitiveLineMutation = useMutation({
    mutationFn: (variables: { startXMm: number; startYMm: number; endXMm: number; endYMm: number; label?: string }) =>
      api.createGeometryPrimitiveLine(id, variables),
    onSuccess: (result, variables) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: "Add line",
        undo: async () => {
          await api.deleteGeometryNode(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createGeometryPrimitiveLine(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  const createGeometryPrimitiveRectangleMutation = useMutation({
    mutationFn: (variables: {
      xMm: number;
      yMm: number;
      widthMm: number;
      heightMm: number;
      rotationDeg?: number;
      label?: string;
    }) => api.createGeometryPrimitiveRectangle(id, variables),
    onSuccess: (result, variables) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: "Add rectangle",
        undo: async () => {
          await api.deleteGeometryNode(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createGeometryPrimitiveRectangle(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  const createGeometryPrimitivePolylineMutation = useMutation({
    mutationFn: (variables: { points: { xMm: number; yMm: number; bulge?: number }[]; closed?: boolean; label?: string }) =>
      api.createGeometryPrimitivePolyline(id, variables),
    onSuccess: (result, variables) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: "Add polyline",
        undo: async () => {
          await api.deleteGeometryNode(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createGeometryPrimitivePolyline(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  const createGeometryPrimitiveArcMutation = useMutation({
    mutationFn: (variables: {
      centerXMm: number;
      centerYMm: number;
      radiusMm: number;
      startAngleDeg: number;
      sweepAngleDeg: number;
      label?: string;
    }) => api.createGeometryPrimitiveArc(id, variables),
    onSuccess: (result, variables) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: "Add arc",
        undo: async () => {
          await api.deleteGeometryNode(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createGeometryPrimitiveArc(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  const createGeometryPrimitiveCircleMutation = useMutation({
    mutationFn: (variables: { centerXMm: number; centerYMm: number; radiusMm: number; label?: string }) =>
      api.createGeometryPrimitiveCircle(id, variables),
    onSuccess: (result, variables) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: "Add circle",
        undo: async () => {
          await api.deleteGeometryNode(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createGeometryPrimitiveCircle(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  if (!design) return null;

  const findPanel = (panelId: string) => design.geometryNodes.find((n) => n.id === panelId)?.panel;
  const findInstance = (instanceId: string) => design.productInstances.find((i) => i.id === instanceId);
  const findFixture = (fixtureId: string) => design.fixtures.find((f) => f.id === fixtureId);

  const handleResizePanel = (panelId: string, widthMm: number) => {
    const previousWidthMm = findPanel(panelId)?.widthMm;
    if (previousWidthMm == null) return;
    resizePanelMutation.mutate(buildPanelResizeInput(panelId, widthMm, previousWidthMm));
  };

  const handleRotatePanel = (panelId: string, orientation: "VERTICAL" | "HORIZONTAL") => {
    const previousOrientation = findPanel(panelId)?.orientation;
    if (previousOrientation == null) return;
    rotatePanelMutation.mutate(buildPanelRotateInput(panelId, orientation, previousOrientation));
  };

  const handleMoveFurniture = (instanceId: string, xMm: number, yMm: number) => {
    const inst = findInstance(instanceId);
    if (!inst) return;
    moveFurnitureMutation.mutate(buildInstanceMoveInput(instanceId, xMm, yMm, inst.x, inst.y));
  };

  const handleRotateFurniture = (instanceId: string, rotationDeg: number) => {
    const inst = findInstance(instanceId);
    if (!inst) return;
    rotateFurnitureMutation.mutate(buildInstanceRotateInput(instanceId, rotationDeg, inst.rotationDeg));
  };

  const handleUpdateQuantity = (instanceId: string, quantity: number) => {
    const inst = findInstance(instanceId);
    if (!inst) return;
    updateQuantityMutation.mutate(buildInstanceQuantityInput(instanceId, quantity, inst.quantity));
  };

  const handleUpdateZ = (instanceId: string, z: number) => {
    const inst = findInstance(instanceId);
    if (!inst) return;
    updateZMutation.mutate({ instanceId, z, previousZ: inst.z ?? 0 });
  };

  const handleUpdateInstanceOptions = (instanceId: string, next: InstanceOptionIds) => {
    const inst = findInstance(instanceId);
    if (!inst) return;
    const previous: InstanceOptionIds = {
      designOptionId: inst.designOptionId ?? undefined,
      colourOptionId: inst.colourOptionId ?? undefined,
      sizeOptionId: inst.sizeOptionId ?? undefined,
    };
    updateInstanceOptionsMutation.mutate(buildInstanceOptionsInput(instanceId, next, previous));
  };

  const handleMoveFixture = (fixtureId: string, xMm: number, yMm: number) => {
    const fx = findFixture(fixtureId);
    if (!fx) return;
    updateFixtureMutation.mutate(
      buildFixtureUpdateInput(fixtureId, { xMm, yMm }, { xMm: fx.xMm, yMm: fx.yMm }),
    );
  };

  const handleUpdateFixture = (fixtureId: string, next: FixtureFields) => {
    const fx = findFixture(fixtureId);
    if (!fx) return;
    const previous: FixtureFields = {};
    for (const key of Object.keys(next) as (keyof FixtureFields)[]) {
      (previous as Record<string, unknown>)[key] = fx[key];
    }
    updateFixtureMutation.mutate(buildFixtureUpdateInput(fixtureId, next, previous));
  };

  const handleDeleteZone = (zoneId: string) => api.deleteZone(id, zoneId).then(invalidate);
  const handleDeletePartition = (partitionId: string) => api.deleteGeometryNode(id, partitionId).then(invalidate);
  const handleDeletePanel = (panelId: string) => api.deleteGeometryNode(id, panelId).then(invalidate);
  const handleDeleteInstance = (instanceId: string) => api.deleteProductInstance(id, instanceId).then(invalidate);
  const handleDeleteFixture = (fixtureId: string) => api.deleteFixture(id, fixtureId).then(invalidate);
  const handleDeleteConstraint = (constraintId: string) => api.deleteConstraint(id, constraintId).then(invalidate);
  // Reuses the existing generic deleteGeometryNode client method -- a
  // GeometryPrimitiveLine shares its PK with a GeometryNode row, same as
  // every other geometry subtype, so no dedicated delete endpoint exists.
  const handleDeleteGeometryPrimitive = (nodeId: string) => api.deleteGeometryNode(id, nodeId).then(invalidate);

  // Advances the click-to-pick state machine as DesignStage forwards picked
  // canvas targets -- FIXED_POSITION has no target B, so target A resolves
  // straight to CONFIGURE for it; every other type goes through PICK_B first.
  const handlePickConstraintTarget = (ref: ConstraintTargetInput) => {
    if (!armedConstraint) return;
    if (armedConstraint.step === "PICK_A") {
      if (armedConstraint.constraintType === "FIXED_POSITION") {
        setArmedConstraint({ step: "CONFIGURE", constraintType: armedConstraint.constraintType, targetA: ref, targetB: null });
      } else {
        setArmedConstraint({ step: "PICK_B", constraintType: armedConstraint.constraintType, targetA: ref });
      }
      return;
    }
    if (armedConstraint.step === "PICK_B") {
      setArmedConstraint({ step: "CONFIGURE", constraintType: armedConstraint.constraintType, targetA: armedConstraint.targetA, targetB: ref });
    }
  };

  const handleDropSku = (payload: SkuDragPayload, target: DesignStageDropTarget | null) => {
    // Furniture is never draggable from the generic palette -- it only ever
    // enters the canvas through the Furniture Catalogue's
    // Product -> Design -> Colour -> Size -> Add to Canvas flow below.
    if (!target) return;
    if (target.kind === "partition") {
      if (payload.categoryKey !== "PRIMARY") {
        alert("Only PRIMARY category SKUs can auto-fill a partition.");
        return;
      }
      autoFillMutation.mutate({ partitionId: target.id, skuId: payload.skuId });
      return;
    }
    setPendingDrop({ payload, target });
  };

  const segmentNodes = design.geometryNodes
    .filter((n) => n.nodeType === "WALL" && n.wallSegment)
    .sort((a, b) => a.wallSegment!.sequence - b.wallSegment!.sequence);
  const activeSegmentNode = segmentNodes.find((n) => n.id === activeSegmentId) ?? segmentNodes[0];
  const junctionForSegment = (segmentId: string | undefined) =>
    design.wallJunctions.find((j) => j.segmentAId === segmentId || j.segmentBId === segmentId);

  return (
    <div className="flex flex-col gap-3">
      {segmentNodes.length > 0 && (
        <div className="flex gap-2 text-xs items-center">
          {segmentNodes.map((n) => {
            const junction = junctionForSegment(n.id);
            const isActive = (activeSegmentNode?.id ?? segmentNodes[0]?.id) === n.id;
            return (
              <button
                key={n.id}
                className={isActive ? "btn" : "btn btn-secondary"}
                onClick={() => setActiveSegment(n.id)}
              >
                Segment {n.wallSegment!.sequence + 1}
                {junction && ` (${junction.angleDeg}°)`}
              </button>
            );
          })}
        </div>
      )}
      {armedFurniture && (
        <p className="text-green-600 text-xs">
          {furnitureSkus.find((s) => s.id === armedFurniture.skuId)?.code ?? "Furniture"} armed — click the canvas to
          position it.
        </p>
      )}
      {armedFixture && (
        <p className="text-green-600 text-xs">{armedFixture.fixtureType} fixture armed — click the canvas to position it.</p>
      )}
      <div className="flex gap-4 items-start">
        <DesignStage
          design={design}
          onSelectEdge={() => {
            /* selection already written into the canvas store by DesignStage itself */
          }}
          onDropSku={handleDropSku}
          onResizePanel={handleResizePanel}
          onRotatePanel={handleRotatePanel}
          onPlaceFurniture={(xMm, yMm) => {
            if (!armedFurniture) return;
            placeFurnitureMutation.mutate({ ...armedFurniture, x: xMm, y: yMm, wallSegmentId: activeSegmentId ?? undefined });
          }}
          onMoveFurniture={handleMoveFurniture}
          onRotateFurniture={handleRotateFurniture}
          onPlaceFixture={(xMm, yMm) => {
            if (!armedFixture) return;
            createFixtureMutation.mutate({ ...armedFixture, xMm, yMm, wallSegmentId: activeSegmentId ?? undefined });
          }}
          onMoveFixture={handleMoveFixture}
          pickTarget={armedConstraint && armedConstraint.step !== "CONFIGURE" ? handlePickConstraintTarget : undefined}
        />
        <div className="flex flex-col gap-3">
          {selection && (
            <Inspector
              designId={id}
              design={design}
              selection={selection}
              isDraft={Boolean(isDraft)}
              onClose={clearSelection}
              onResizePanel={handleResizePanel}
              onRotatePanel={handleRotatePanel}
              onDeletePanel={(panelId) => handleDeletePanel(panelId)}
              onMoveFurniture={handleMoveFurniture}
              onRotateFurniture={handleRotateFurniture}
              onUpdateInstanceQuantity={handleUpdateQuantity}
              onUpdateInstanceZ={handleUpdateZ}
              onUpdateInstanceOptions={handleUpdateInstanceOptions}
              onDeleteInstance={(instanceId) => handleDeleteInstance(instanceId)}
              onDeleteZone={(zoneId) => handleDeleteZone(zoneId)}
              onDeletePartition={(partitionId) => handleDeletePartition(partitionId)}
              onUpdateFixture={handleUpdateFixture}
              onDeleteFixture={(fixtureId) => handleDeleteFixture(fixtureId)}
              onDeleteConstraint={(constraintId) => handleDeleteConstraint(constraintId)}
              onDeleteGeometryPrimitive={(nodeId) => handleDeleteGeometryPrimitive(nodeId)}
            />
          )}
          <FurnitureCatalogue
            skus={furnitureSkus}
            armed={armedFurniture}
            onArm={(f) => {
              setArmedFixture(null);
              setArmedConstraint(null);
              setArmedFurniture(f);
            }}
          />
          <FixturePalette
            armed={armedFixture}
            onArm={(f) => {
              setArmedFurniture(null);
              setArmedConstraint(null);
              setArmedFixture(f);
            }}
          />
          <ConstraintPalette
            armed={armedConstraint}
            onStart={(constraintType) => {
              setArmedFurniture(null);
              setArmedFixture(null);
              setArmedConstraint({ step: "PICK_A", constraintType });
            }}
            onCancel={() => setArmedConstraint(null)}
            onCreate={(config) => {
              if (!armedConstraint || armedConstraint.step !== "CONFIGURE") return;
              createConstraintMutation.mutate({
                constraintType: armedConstraint.constraintType,
                targetA: armedConstraint.targetA,
                targetB: armedConstraint.targetB,
                axis: config.axis,
                valueMm: config.valueMm,
                minValueMm: config.minValueMm,
                maxValueMm: config.maxValueMm,
              });
            }}
            isPending={createConstraintMutation.isPending}
            error={createConstraintMutation.isError ? (createConstraintMutation.error as Error).message : null}
          />
          <SkuPalette skus={nonFurnitureSkus} />
          <GeometryPrimitivePalette
            onCreateRectangle={(input) => createGeometryPrimitiveRectangleMutation.mutate(input)}
            onCreateLine={(input) => createGeometryPrimitiveLineMutation.mutate(input)}
            onCreatePolyline={(input) => createGeometryPrimitivePolylineMutation.mutate(input)}
            onCreateArc={(input) => createGeometryPrimitiveArcMutation.mutate(input)}
            onCreateCircle={(input) => createGeometryPrimitiveCircleMutation.mutate(input)}
            isPending={
              createGeometryPrimitiveRectangleMutation.isPending ||
              createGeometryPrimitiveLineMutation.isPending ||
              createGeometryPrimitivePolylineMutation.isPending ||
              createGeometryPrimitiveArcMutation.isPending ||
              createGeometryPrimitiveCircleMutation.isPending
            }
            error={
              (createGeometryPrimitiveRectangleMutation.isError && (createGeometryPrimitiveRectangleMutation.error as Error).message) ||
              (createGeometryPrimitiveLineMutation.isError && (createGeometryPrimitiveLineMutation.error as Error).message) ||
              (createGeometryPrimitivePolylineMutation.isError && (createGeometryPrimitivePolylineMutation.error as Error).message) ||
              (createGeometryPrimitiveArcMutation.isError && (createGeometryPrimitiveArcMutation.error as Error).message) ||
              (createGeometryPrimitiveCircleMutation.isError && (createGeometryPrimitiveCircleMutation.error as Error).message) ||
              null
            }
          />
        </div>
      </div>

      {autoFillMutation.isError && <p className="issue-error">{(autoFillMutation.error as Error).message}</p>}
      {autoFillMutation.isSuccess && autoFillMutation.data && (
        <p className="text-green-600 text-xs">
          Auto-filled: {autoFillMutation.data.fill.count} panel(s) at {autoFillMutation.data.fill.panelWidthMm}mm
          {autoFillMutation.data.fill.hasOffcut &&
            `, offcut ${autoFillMutation.data.fill.remainderMm}mm (${autoFillMutation.data.fill.offcutReusable ? "reusable" : "waste"})`}
        </p>
      )}

      {pendingDrop && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>
            Link dropped SKU ({pendingDrop.payload.skuId}) to {pendingDrop.target.kind}
          </h2>
          <div className="form-row">
            <div className="field">
              <label>Relationship Type</label>
              <select value={dropRelationshipType} onChange={(e) => setDropRelationshipType(e.target.value)}>
                {DROP_RELATIONSHIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              disabled={linkDropMutation.isPending}
              onClick={() => {
                if (!pendingDrop) return;
                linkDropMutation.mutate({
                  skuId: pendingDrop.payload.skuId,
                  target: pendingDrop.target,
                  relationshipType: dropRelationshipType,
                });
              }}
            >
              Confirm
            </button>
            <button className="btn btn-secondary" onClick={() => setPendingDrop(null)}>
              Cancel
            </button>
          </div>
          {linkDropMutation.isError && <p className="issue-error">{(linkDropMutation.error as Error).message}</p>}
        </div>
      )}
    </div>
  );
}
