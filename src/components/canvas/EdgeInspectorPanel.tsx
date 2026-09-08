"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { GeometryEdgeModel } from "@/generated/prisma/models";

const FLAGS: { key: keyof GeometryEdgeModel; label: string }[] = [
  { key: "requiresTrim", label: "Requires trim" },
  { key: "requiresConnector", label: "Requires connector" },
  { key: "requiresTermination", label: "Requires termination" },
  { key: "isLightingBoundary", label: "Lighting boundary" },
];

export function EdgeInspectorPanel({
  designId,
  edge,
  onClose,
}: {
  designId: string;
  edge: GeometryEdgeModel;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: Partial<Record<string, boolean>>) => api.updateGeometryEdge(designId, edge.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", designId] }),
  });

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3 style={{ fontSize: 14 }}>Edge Inspector — {edge.edgeRole}</h3>
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
      {FLAGS.map(({ key, label }) => (
        <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={Boolean(edge[key])}
            onChange={(e) => mutation.mutate({ [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
