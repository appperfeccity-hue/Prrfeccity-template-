"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useUndoRedo } from "@/lib/undo-redo";
import { useCanvasStore } from "@/lib/canvas/store";
import { useKeyboardShortcuts } from "@/lib/canvas/keyboard";
import { DesignStage, type DesignStageDropTarget } from "@/components/canvas/DesignStage";
import { EdgeInspectorPanel } from "@/components/canvas/EdgeInspectorPanel";
import { SkuPalette, type SkuDragPayload } from "@/components/palette/SkuPalette";

const DROP_RELATIONSHIP_TYPES = ["HAS_TREATMENT", "SUPPORTS", "TERMINATES", "BOUNDARY_OF", "POSITIONED_AT", "ADJACENT_TO"];

/**
 * UI-M4: the unified DesignStage, mounted alongside (not replacing) the
 * existing Wall/Zones & Panels/Furniture sections' own canvases, per the
 * explicit instruction to verify the new canvas against the old rendering
 * before switching the workspace over. Owns the same mutation set as
 * ZonesSection/FurnitureSection (resize/rotate panel, auto-fill, link-drop,
 * place/move/rotate furniture) -- this is intentional, temporary
 * duplication for the parallel-verification window; once the old canvases
 * are removed in a follow-up step, one of the two copies goes with them.
 */
export function DesignStageSection({ designId: id }: { designId: string }) {
  const queryClient = useQueryClient();
  const { pushAction } = useUndoRedo();
  const { selection, select } = useCanvasStore();
  useKeyboardShortcuts();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const skusQuery = useQuery({ queryKey: ["skus"], queryFn: () => api.listSkus() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["design", id] });
  const design = designQuery.data;

  const [pendingDrop, setPendingDrop] = useState<{ payload: SkuDragPayload; target: { kind: "panel" | "edge"; id: string } } | null>(null);
  const [dropRelationshipType, setDropRelationshipType] = useState(DROP_RELATIONSHIP_TYPES[0]);
  const [selectedFurnitureSkuId, setSelectedFurnitureSkuId] = useState("");
  const furnitureSkus = (skusQuery.data ?? []).filter((s) => s.category.key === "FURNITURE");

  const resizePanelMutation = useMutation({
    mutationFn: ({ panelId, widthMm }: { panelId: string; widthMm: number; previousWidthMm: number }) =>
      api.updatePanel(id, panelId, { widthMm }),
    onSuccess: (_result, variables) => {
      invalidate();
      pushAction({
        description: `Resize panel to ${variables.widthMm}mm`,
        undo: async () => {
          await api.updatePanel(id, variables.panelId, { widthMm: variables.previousWidthMm });
          invalidate();
        },
        redo: async () => {
          await api.updatePanel(id, variables.panelId, { widthMm: variables.widthMm });
          invalidate();
        },
      });
    },
  });

  const rotatePanelMutation = useMutation({
    mutationFn: ({ panelId, orientation }: { panelId: string; orientation: "VERTICAL" | "HORIZONTAL"; previousOrientation: "VERTICAL" | "HORIZONTAL" }) =>
      api.updatePanel(id, panelId, { orientation }),
    onSuccess: (_result, variables) => {
      invalidate();
      pushAction({
        description: `Rotate panel to ${variables.orientation}`,
        undo: async () => {
          await api.updatePanel(id, variables.panelId, { orientation: variables.previousOrientation });
          invalidate();
        },
        redo: async () => {
          await api.updatePanel(id, variables.panelId, { orientation: variables.orientation });
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
    mutationFn: ({ skuId, x, y }: { skuId: string; x: number; y: number }) =>
      api.createProductInstance(id, { skuId, x, y }),
    onSuccess: (result, variables) => {
      invalidate();
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
    mutationFn: ({ instanceId, x, y }: { instanceId: string; x: number; y: number; previousX: number; previousY: number }) =>
      api.updateProductInstance(id, instanceId, { x, y }),
    onSuccess: (_result, variables) => {
      invalidate();
      pushAction({
        description: `Move furniture`,
        undo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { x: variables.previousX, y: variables.previousY });
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { x: variables.x, y: variables.y });
          invalidate();
        },
      });
    },
  });

  const rotateFurnitureMutation = useMutation({
    mutationFn: ({ instanceId, rotationDeg }: { instanceId: string; rotationDeg: number; previousRotationDeg: number }) =>
      api.updateProductInstance(id, instanceId, { rotationDeg }),
    onSuccess: (_result, variables) => {
      invalidate();
      pushAction({
        description: `Rotate furniture`,
        undo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { rotationDeg: variables.previousRotationDeg });
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { rotationDeg: variables.rotationDeg });
          invalidate();
        },
      });
    },
  });

  if (!design) return null;

  const selectedEdge =
    selection?.kind === "edge"
      ? design.geometryNodes.flatMap((n) => n.edges).find((e) => e.id === selection.id)
      : undefined;

  const handleDropSku = (payload: SkuDragPayload, target: DesignStageDropTarget | null, mm: { x: number; y: number }) => {
    if (payload.categoryKey === "FURNITURE") {
      placeFurnitureMutation.mutate({ skuId: payload.skuId, x: mm.x, y: mm.y });
      return;
    }
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

  return (
    <div className="flex flex-col gap-3">
      <div className="form-row">
        <div className="field">
          <label>Furniture SKU (click canvas to place, or drag from palette)</label>
          <select value={selectedFurnitureSkuId} onChange={(e) => setSelectedFurnitureSkuId(e.target.value)}>
            <option value="">Select…</option>
            {furnitureSkus.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-4 items-start">
        <DesignStage
          design={design}
          onSelectEdge={() => {
            /* selection already written into the canvas store by DesignStage itself */
          }}
          onDropSku={handleDropSku}
          onResizePanel={(panelId, widthMm) => {
            const previousWidthMm = design.geometryNodes.find((n) => n.id === panelId)?.panel?.widthMm;
            if (previousWidthMm == null) return;
            resizePanelMutation.mutate({ panelId, widthMm, previousWidthMm });
          }}
          onRotatePanel={(panelId, orientation) => {
            const previousOrientation = design.geometryNodes.find((n) => n.id === panelId)?.panel?.orientation;
            if (previousOrientation == null) return;
            rotatePanelMutation.mutate({ panelId, orientation, previousOrientation });
          }}
          onPlaceFurniture={(xMm, yMm) => {
            if (!selectedFurnitureSkuId) return;
            placeFurnitureMutation.mutate({ skuId: selectedFurnitureSkuId, x: xMm, y: yMm });
          }}
          onMoveFurniture={(instanceId, xMm, yMm) => {
            const inst = design.productInstances.find((i) => i.id === instanceId);
            if (!inst) return;
            moveFurnitureMutation.mutate({ instanceId, x: xMm, y: yMm, previousX: inst.x ?? 0, previousY: inst.y ?? 0 });
          }}
          onRotateFurniture={(instanceId, rotationDeg) => {
            const inst = design.productInstances.find((i) => i.id === instanceId);
            if (!inst) return;
            rotateFurnitureMutation.mutate({ instanceId, rotationDeg, previousRotationDeg: inst.rotationDeg ?? 0 });
          }}
        />
        <SkuPalette skus={skusQuery.data ?? []} />
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

      {selectedEdge && <EdgeInspectorPanel designId={id} edge={selectedEdge} onClose={() => select(null)} />}
    </div>
  );
}
