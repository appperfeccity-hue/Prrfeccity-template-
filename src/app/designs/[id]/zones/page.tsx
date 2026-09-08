"use client";

import { use, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { EdgeInspectorPanel } from "@/components/canvas/EdgeInspectorPanel";
import type { GeometryEdgeModel } from "@/generated/prisma/models";

const ZoneCanvas = dynamic(() => import("@/components/canvas/ZoneCanvas").then((m) => m.ZoneCanvas), {
  ssr: false,
});

export default function ZonesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const [selectedEdge, setSelectedEdge] = useState<GeometryEdgeModel | null>(null);

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
    mutationFn: () =>
      api.createZone(id, {
        wallId: associatesWith === "WALL" ? wallNode?.wall?.id : undefined,
        associatesWith,
        orderIndex: zoneNodes.length,
        widthMm: zoneWidth,
        heightMm: wallNode?.wall?.heightMm ?? 2400,
        hasCoveLighting,
        coveLightZMm: hasCoveLighting ? coveLightZMm : undefined,
      }),
    onSuccess: invalidate,
  });

  // --- Add Partition ---
  const [partitionZoneId, setPartitionZoneId] = useState("");
  const [partitionWidth, setPartitionWidth] = useState(1000);
  const partitionsForZone = (zoneId: string) =>
    design?.geometryNodes.filter((n) => n.nodeType === "PARTITION" && n.partition?.zoneId === zoneId) ?? [];

  const addPartitionMutation = useMutation({
    mutationFn: () => {
      const zoneNode = zoneNodes.find((z) => z.id === partitionZoneId)!;
      return api.createPartition(id, partitionZoneId, {
        orderIndex: partitionsForZone(partitionZoneId).length,
        widthMm: partitionWidth,
        heightMm: zoneNode.zone!.heightMm,
      });
    },
    onSuccess: invalidate,
  });

  // --- Add Panel ---
  const [panelPartitionId, setPanelPartitionId] = useState("");
  const [panelWidth, setPanelWidth] = useState(600);
  const allPartitions = design?.geometryNodes.filter((n) => n.nodeType === "PARTITION") ?? [];
  const panelsForPartition = (partitionId: string) =>
    design?.geometryNodes.filter((n) => n.nodeType === "PANEL" && n.panel?.partitionId === partitionId) ?? [];

  const addPanelMutation = useMutation({
    mutationFn: () => {
      const partitionNode = allPartitions.find((p) => p.id === panelPartitionId)!;
      return api.createPanel(id, panelPartitionId, {
        orderIndex: panelsForPartition(panelPartitionId).length,
        widthMm: panelWidth,
        heightMm: partitionNode.partition!.heightMm,
        orientation: "VERTICAL",
      });
    },
    onSuccess: invalidate,
  });

  // --- Adjacency ---
  const [adjA, setAdjA] = useState("");
  const [adjB, setAdjB] = useState("");
  const adjacencyMutation = useMutation({
    mutationFn: () => {
      const edgeA = zoneNodes.find((z) => z.id === adjA)?.edges.find((e) => e.edgeRole === "OUTER_BOUNDARY");
      const edgeB = zoneNodes.find((z) => z.id === adjB)?.edges.find((e) => e.edgeRole === "OUTER_BOUNDARY");
      if (!edgeA || !edgeB) throw new Error("Select two zones");
      return api.createGeometryEdgeRelationship(id, {
        edgeAId: edgeA.id,
        edgeBId: edgeB.id,
        relationshipType: "ADJACENCY",
      });
    },
    onSuccess: invalidate,
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
          <button className="btn" disabled={zoneNodes.length >= 3 || addZoneMutation.isPending} onClick={() => addZoneMutation.mutate()}>
            Add Zone
          </button>
        </div>
        {addZoneMutation.isError && <p className="issue-error">{(addZoneMutation.error as Error).message}</p>}
      </div>

      {design && (
        <ZoneCanvas nodes={design.geometryNodes} selectedEdgeId={selectedEdge?.id} onSelectEdge={setSelectedEdge} />
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
          <button className="btn" disabled={!partitionZoneId || addPartitionMutation.isPending} onClick={() => addPartitionMutation.mutate()}>
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
          <button className="btn" disabled={!panelPartitionId || addPanelMutation.isPending} onClick={() => addPanelMutation.mutate()}>
            Add Panel
          </button>
        </div>
        <p style={{ color: "#888", fontSize: 13 }}>Click a panel's edge line on the canvas above to flag it (trim / connector / termination / lighting).</p>
      </div>

      {zoneNodes.length >= 2 && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Zone Adjacency</h2>
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
            <button className="btn" disabled={!adjA || !adjB || adjA === adjB} onClick={() => adjacencyMutation.mutate()}>
              Link Adjacent
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
