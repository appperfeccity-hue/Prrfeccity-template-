"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useUndoRedo } from "@/lib/undo-redo";
import type { GeometryEdgeRelationshipTypeValue } from "@/lib/api/client";

const ZONE_RELATIONSHIP_TYPES: { value: GeometryEdgeRelationshipTypeValue; label: string }[] = [
  { value: "ADJACENT_TO", label: "Adjacent To" },
  { value: "MEETS", label: "Meets" },
  { value: "SHARES_BOUNDARY", label: "Shares Boundary" },
  { value: "CONTINUES_TO", label: "Continues To" },
  { value: "TERMINATES_AT", label: "Terminates At" },
];

/**
 * UI-M6a: Add Zone / Add Partition / Add Panel / Zone Relationship linker,
 * ported near-verbatim from the old ZonesSection.tsx. Everything else that
 * file owned (auto-fill, drag-link, panel resize/rotate, the ZoneCanvas/
 * SkuPalette render, edge selection) is already covered by
 * DesignStageSection.tsx + the shared canvas store/Inspector -- not
 * duplicated here.
 */
export function CreatePanel({ designId: id, isDraft }: { designId: string; isDraft: boolean }) {
  const queryClient = useQueryClient();
  const { pushAction } = useUndoRedo();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });

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
            disabled={!isDraft || zoneNodes.length >= 3 || addZoneMutation.isPending}
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
        {zoneNodes.map((z) => (
          <div key={z.id} className="form-row" style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 8 }}>
            <div className="field">
              Zone {z.zone!.orderIndex} · {z.zone!.associatesWith} · {z.zone!.widthMm}mm
            </div>
            <button
              className="btn btn-secondary"
              disabled={!isDraft}
              onClick={() => {
                if (!confirm("Delete this zone? This cannot be undone.")) return;
                api.deleteZone(id, z.id).then(invalidate);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

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
            disabled={!isDraft || !partitionZoneId || addPartitionMutation.isPending}
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
        {allPartitions.map((p) => (
          <div key={p.id} className="form-row" style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 8 }}>
            <div className="field">
              {p.label} ({p.partition!.widthMm}mm)
            </div>
            <button
              className="btn btn-secondary"
              disabled={!isDraft}
              onClick={() => {
                if (!confirm("Delete this partition? This cannot be undone.")) return;
                api.deleteGeometryNode(id, p.id).then(invalidate);
              }}
            >
              Delete
            </button>
          </div>
        ))}
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
            disabled={!isDraft || !panelPartitionId || addPanelMutation.isPending}
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
        <p style={{ color: "#888", fontSize: 13 }}>Select a panel on the canvas above to resize/rotate/flag its edges.</p>
        {allPartitions.flatMap((p) => panelsForPartition(p.id)).map((panel) => (
          <div key={panel.id} className="form-row" style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 8 }}>
            <div className="field">
              {panel.label} ({panel.panel!.widthMm}mm · {panel.panel!.orientation})
            </div>
            <button
              className="btn btn-secondary"
              disabled={!isDraft}
              onClick={() => {
                if (!confirm("Delete this panel? This cannot be undone.")) return;
                api.deleteGeometryNode(id, panel.id).then(invalidate);
              }}
            >
              Delete
            </button>
          </div>
        ))}
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
              disabled={!isDraft || !adjA || !adjB || adjA === adjB}
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
          {adjacencyMutation.isError && <p className="issue-error">{(adjacencyMutation.error as Error).message}</p>}
        </div>
      )}
    </div>
  );
}
