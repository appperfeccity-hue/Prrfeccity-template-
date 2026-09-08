"use client";

import { use, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { EdgeInspectorPanel } from "@/components/canvas/EdgeInspectorPanel";
import { SkuPalette, type SkuDragPayload } from "@/components/palette/SkuPalette";
import { useUndoRedo } from "@/lib/undo-redo";
import type { GeometryEdgeModel } from "@/generated/prisma/models";
import type { GeometryEdgeRelationshipTypeValue } from "@/lib/api/client";
import type { ZoneCanvasDropTarget } from "@/components/canvas/ZoneCanvas";

const ZONE_RELATIONSHIP_TYPES: { value: GeometryEdgeRelationshipTypeValue; label: string }[] = [
  { value: "ADJACENT_TO", label: "Adjacent To" },
  { value: "MEETS", label: "Meets" },
  { value: "SHARES_BOUNDARY", label: "Shares Boundary" },
  { value: "CONTINUES_TO", label: "Continues To" },
  { value: "TERMINATES_AT", label: "Terminates At" },
];

const DROP_RELATIONSHIP_TYPES = ["HAS_TREATMENT", "SUPPORTS", "TERMINATES", "BOUNDARY_OF", "POSITIONED_AT", "ADJACENT_TO"];

const ZoneCanvas = dynamic(() => import("@/components/canvas/ZoneCanvas").then((m) => m.ZoneCanvas), {
  ssr: false,
});

export default function ZonesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { pushAction } = useUndoRedo();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const skusQuery = useQuery({ queryKey: ["skus"], queryFn: () => api.listSkus() });
  const [selectedEdge, setSelectedEdge] = useState<GeometryEdgeModel | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ payload: SkuDragPayload; target: { kind: "panel" | "edge"; id: string } } | null>(null);
  const [dropRelationshipType, setDropRelationshipType] = useState(DROP_RELATIONSHIP_TYPES[0]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["design", id] });

  const design = designQuery.data;
  const wallNode = design?.geometryNodes.find((n) => n.nodeType === "WALL");
  const zoneNodes = design?.geometryNodes.filter((n) => n.nodeType === "ZONE") ?? [];

  // --- Add Zone ---
  const [zoneWidth, setZoneWidth] = useState(1000);
  const [associatesWith, setAssociatesWith] = useState<"WALL" | "STRUCTURE">("WALL");
  const [hasCoveLighting, setHasCoveLighting] = useState(false);
  const [coveLightZMm, setCoveLightZMm] = useState(1800);

  const addZoneMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.createZone>[1]) => api.createZone(id, input),
    onSuccess: (result, input) => {
      invalidate();
      let currentId = result.zone.id;
      pushAction({
        description: `Add zone ${input.orderIndex}`,
        undo: async () => {
          await api.deleteZone(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createZone(id, input);
          currentId = r.zone.id;
          invalidate();
        },
      });
    },
  });

  // --- Add Partition ---
  const [partitionZoneId, setPartitionZoneId] = useState("");
  const [partitionWidth, setPartitionWidth] = useState(1000);
  const partitionsForZone = (zoneId: string) =>
    design?.geometryNodes.filter((n) => n.nodeType === "PARTITION" && n.partition?.zoneId === zoneId) ?? [];

  const addPartitionMutation = useMutation({
    mutationFn: ({ zoneId, ...input }: { zoneId: string } & Parameters<typeof api.createPartition>[2]) =>
      api.createPartition(id, zoneId, input),
    onSuccess: (result, variables) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: `Add partition ${variables.orderIndex}`,
        undo: async () => {
          await api.deleteGeometryNode(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createPartition(id, variables.zoneId, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  // --- Add Panel ---
  const [panelPartitionId, setPanelPartitionId] = useState("");
  const [panelWidth, setPanelWidth] = useState(600);
  const allPartitions = design?.geometryNodes.filter((n) => n.nodeType === "PARTITION") ?? [];
  const panelsForPartition = (partitionId: string) =>
    design?.geometryNodes.filter((n) => n.nodeType === "PANEL" && n.panel?.partitionId === partitionId) ?? [];

  const addPanelMutation = useMutation({
    mutationFn: ({ partitionId, ...input }: { partitionId: string } & Parameters<typeof api.createPanel>[2]) =>
      api.createPanel(id, partitionId, input),
    onSuccess: (result, variables) => {
      invalidate();
      let currentId = result.panel.id;
      pushAction({
        description: `Add panel ${variables.orderIndex}`,
        undo: async () => {
          await api.deleteGeometryNode(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createPanel(id, variables.partitionId, variables);
          currentId = r.panel.id;
          invalidate();
        },
      });
    },
  });

  // --- Zone relationship ---
  const [adjA, setAdjA] = useState("");
  const [adjB, setAdjB] = useState("");
  const [adjType, setAdjType] = useState<GeometryEdgeRelationshipTypeValue>("ADJACENT_TO");
  const adjacencyMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.createGeometryEdgeRelationship>[1]) =>
      api.createGeometryEdgeRelationship(id, input),
    onSuccess: (result, input) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: `Link zone relationship (${input.relationshipType})`,
        undo: async () => {
          await api.deleteGeometryEdgeRelationship(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createGeometryEdgeRelationship(id, input);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  // --- Drag-and-drop from the SKU palette ---
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

  const handleDropSku = (payload: SkuDragPayload, target: ZoneCanvasDropTarget | null) => {
    if (!target) return; // freestanding placement stays the Products page form's job
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

  if (!wallNode?.wall) {
    return <p>Configure the wall first.</p>;
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add Zone ({zoneNodes.length}/3)</h2>
        <div className="form-row">
          <div className="field">
            <label>Associates With</label>
            <select value={associatesWith} onChange={(e) => setAssociatesWith(e.target.value as "WALL" | "STRUCTURE")}>
              <option value="WALL">Wall</option>
              <option value="STRUCTURE">Structure</option>
            </select>
          </div>
          <div className="field">
            <label>Width (mm)</label>
            <input type="number" value={zoneWidth} onChange={(e) => setZoneWidth(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>
              <input type="checkbox" checked={hasCoveLighting} onChange={(e) => setHasCoveLighting(e.target.checked)} /> Cove
              lighting
            </label>
          </div>
          {hasCoveLighting && (
            <div className="field">
              <label>Cove light Z (mm)</label>
              <input type="number" value={coveLightZMm} onChange={(e) => setCoveLightZMm(Number(e.target.value))} />
            </div>
          )}
          <button
            className="btn"
            disabled={zoneNodes.length >= 3 || addZoneMutation.isPending}
            onClick={() =>
              addZoneMutation.mutate({
                wallId: associatesWith === "WALL" ? wallNode?.wall?.id : undefined,
                associatesWith,
                orderIndex: zoneNodes.length,
                widthMm: zoneWidth,
                heightMm: wallNode?.wall?.heightMm ?? 2400,
                hasCoveLighting,
                coveLightZMm: hasCoveLighting ? coveLightZMm : undefined,
              })
            }
          >
            Add Zone
          </button>
        </div>
        {addZoneMutation.isError && <p className="issue-error">{(addZoneMutation.error as Error).message}</p>}
      </div>

      {design && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <ZoneCanvas
            nodes={design.geometryNodes}
            selectedEdgeId={selectedEdge?.id}
            onSelectEdge={setSelectedEdge}
            onDropSku={handleDropSku}
            onResizePanel={(panelId, widthMm) => {
              const previousWidthMm = design.geometryNodes.find((n) => n.id === panelId)?.panel?.widthMm;
              if (previousWidthMm == null) return;
              resizePanelMutation.mutate({ panelId, widthMm, previousWidthMm });
            }}
          />
          <SkuPalette skus={skusQuery.data ?? []} />
        </div>
      )}
      {autoFillMutation.isError && <p className="issue-error">{(autoFillMutation.error as Error).message}</p>}
      {autoFillMutation.isSuccess && autoFillMutation.data && (
        <p style={{ color: "#16a34a", fontSize: 13 }}>
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

      {selectedEdge && <EdgeInspectorPanel designId={id} edge={selectedEdge} onClose={() => setSelectedEdge(null)} />}

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add Partition</h2>
        <div className="form-row">
          <div className="field">
            <label>Zone</label>
            <select value={partitionZoneId} onChange={(e) => setPartitionZoneId(e.target.value)}>
              <option value="">Select zone…</option>
              {zoneNodes.map((z) => (
                <option key={z.id} value={z.id}>
                  Zone {z.zone!.orderIndex}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Width (mm)</label>
            <input type="number" value={partitionWidth} onChange={(e) => setPartitionWidth(Number(e.target.value))} />
          </div>
          <button
            className="btn"
            disabled={!partitionZoneId || addPartitionMutation.isPending}
            onClick={() => {
              const zoneNode = zoneNodes.find((z) => z.id === partitionZoneId)!;
              addPartitionMutation.mutate({
                zoneId: partitionZoneId,
                orderIndex: partitionsForZone(partitionZoneId).length,
                widthMm: partitionWidth,
                heightMm: zoneNode.zone!.heightMm,
              });
            }}
          >
            Add Partition
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add Panel</h2>
        <div className="form-row">
          <div className="field">
            <label>Partition</label>
            <select value={panelPartitionId} onChange={(e) => setPanelPartitionId(e.target.value)}>
              <option value="">Select partition…</option>
              {allPartitions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.partition!.widthMm}mm)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Width (mm)</label>
            <input type="number" value={panelWidth} onChange={(e) => setPanelWidth(Number(e.target.value))} />
          </div>
          <button
            className="btn"
            disabled={!panelPartitionId || addPanelMutation.isPending}
            onClick={() => {
              const partitionNode = allPartitions.find((p) => p.id === panelPartitionId)!;
              addPanelMutation.mutate({
                partitionId: panelPartitionId,
                orderIndex: panelsForPartition(panelPartitionId).length,
                widthMm: panelWidth,
                heightMm: partitionNode.partition!.heightMm,
                orientation: "VERTICAL",
              });
            }}
          >
            Add Panel
          </button>
        </div>
        <p style={{ color: "#888", fontSize: 13 }}>Click a panel's edge line on the canvas above to flag it (trim / connector / termination / lighting).</p>
      </div>

      {zoneNodes.length >= 2 && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Zone Relationship</h2>
          <div className="form-row">
            <div className="field">
              <label>Zone A</label>
              <select value={adjA} onChange={(e) => setAdjA(e.target.value)}>
                <option value="">Select…</option>
                {zoneNodes.map((z) => (
                  <option key={z.id} value={z.id}>
                    Zone {z.zone!.orderIndex}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Zone B</label>
              <select value={adjB} onChange={(e) => setAdjB(e.target.value)}>
                <option value="">Select…</option>
                {zoneNodes.map((z) => (
                  <option key={z.id} value={z.id}>
                    Zone {z.zone!.orderIndex}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Relationship Type</label>
              <select value={adjType} onChange={(e) => setAdjType(e.target.value as GeometryEdgeRelationshipTypeValue)}>
                {ZONE_RELATIONSHIP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              disabled={!adjA || !adjB || adjA === adjB}
              onClick={() => {
                const edgeA = zoneNodes.find((z) => z.id === adjA)?.edges.find((e) => e.edgeRole === "OUTER_BOUNDARY");
                const edgeB = zoneNodes.find((z) => z.id === adjB)?.edges.find((e) => e.edgeRole === "OUTER_BOUNDARY");
                if (!edgeA || !edgeB) return;
                adjacencyMutation.mutate({ edgeAId: edgeA.id, edgeBId: edgeB.id, relationshipType: adjType });
              }}
            >
              Link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
