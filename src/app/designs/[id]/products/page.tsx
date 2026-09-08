"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

const CATEGORIES = ["PRIMARY", "STRUCTURAL", "CONNECTION", "DECORATIVE", "FUNCTIONAL", "INSTALLATION"];
const RELATIONSHIP_TYPES = ["HAS_TREATMENT", "SUPPORTS", "TERMINATES", "BOUNDARY_OF", "POSITIONED_AT", "ADJACENT_TO"];

export default function ProductsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const skusQuery = useQuery({ queryKey: ["skus"], queryFn: () => api.listSkus() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["design", id] });
  const design = designQuery.data;
  const skus = skusQuery.data?.filter((s) => s.category !== "FURNITURE") ?? [];
  const instances = design?.productInstances.filter((pi) => pi.sku?.category !== "FURNITURE") ?? [];

  const flagSummary = (e: { requiresTermination: boolean; requiresConnector: boolean; requiresTrim: boolean; isLightingBoundary: boolean }) =>
    [
      e.requiresTrim && "trim",
      e.requiresConnector && "connector",
      e.requiresTermination && "termination",
      e.isLightingBoundary && "lighting",
    ]
      .filter(Boolean)
      .join("/");

  const flaggedEdges =
    design?.geometryNodes.flatMap((n) =>
      n.edges
        .filter((e) => e.requiresTermination || e.requiresConnector || e.requiresTrim || e.isLightingBoundary)
        .map((e) => {
          const side = (e.metadata as { side?: string } | null)?.side;
          return { ...e, nodeLabel: `${n.label}${side ? ` (${side})` : ""} — needs ${flagSummary(e)}` };
        }),
    ) ?? [];
  const panelNodes = design?.geometryNodes.filter((n) => n.nodeType === "PANEL") ?? [];

  // --- Place instance ---
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [targetKey, setTargetKey] = useState(""); // "edge:<id>" | "node:<id>" | ""
  const [relationshipType, setRelationshipType] = useState(RELATIONSHIP_TYPES[0]);
  const [z, setZ] = useState<number | "">("");

  const placeMutation = useMutation({
    mutationFn: async () => {
      const instance = await api.createProductInstance(id, {
        skuId: selectedSkuId,
        z: z === "" ? undefined : Number(z),
      });
      if (targetKey) {
        const [kind, targetId] = targetKey.split(":");
        await api.createGeometryProductRelationship(id, {
          geometryEdgeId: kind === "edge" ? targetId : undefined,
          geometryNodeId: kind === "node" ? targetId : undefined,
          productInstanceId: instance.id,
          relationshipType,
        });
      }
      return instance;
    },
    onSuccess: () => {
      setTargetKey("");
      invalidate();
    },
  });

  // --- Instance-to-instance edge ---
  const [fromInstanceId, setFromInstanceId] = useState("");
  const [toInstanceId, setToInstanceId] = useState("");
  const [edgeType, setEdgeType] = useState("REQUIRES");
  const fromInstance = instances.find((i) => i.id === fromInstanceId);
  const skuDetailQuery = useQuery({
    queryKey: ["sku", fromInstance?.skuId],
    queryFn: () => api.getSku(fromInstance!.skuId),
    enabled: Boolean(fromInstance?.skuId),
  });

  const linkInstancesMutation = useMutation({
    mutationFn: () => {
      const toInstance = instances.find((i) => i.id === toInstanceId);
      const sourceSkuEdge = skuDetailQuery.data?.edgesFrom.find(
        (e) => e.edgeType === edgeType && e.toSkuId === toInstance?.skuId,
      );
      return api.createProductInstanceEdge(id, {
        fromInstanceId,
        toInstanceId,
        edgeType,
        sourceSkuEdgeId: sourceSkuEdge?.id,
      });
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Place a Product</h2>
        <div className="form-row">
          <div className="field">
            <label>SKU</label>
            <select value={selectedSkuId} onChange={(e) => setSelectedSkuId(e.target.value)}>
              <option value="">Select SKU…</option>
              {CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {skus.filter((s) => s.category === cat).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Z position (mm, optional — cove lighting)</label>
            <input type="number" value={z} onChange={(e) => setZ(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label>Link to geometry (optional)</label>
            <select value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
              <option value="">No geometry link (freestanding)</option>
              <optgroup label="Flagged edges">
                {flaggedEdges.map((e) => (
                  <option key={e.id} value={`edge:${e.id}`}>
                    {e.edgeRole}: {e.nodeLabel}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Panels (structural support)">
                {panelNodes.map((n) => (
                  <option key={n.id} value={`node:${n.id}`}>
                    {n.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          {targetKey && (
            <div className="field">
              <label>Relationship Type</label>
              <select value={relationshipType} onChange={(e) => setRelationshipType(e.target.value)}>
                {RELATIONSHIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn" disabled={!selectedSkuId || placeMutation.isPending} onClick={() => placeMutation.mutate()}>
            Place Product
          </button>
        </div>
        {placeMutation.isError && <p className="issue-error">{(placeMutation.error as Error).message}</p>}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Placed Products</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Z</th>
              <th>Relationships</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => {
              const rels = design?.geometryProductRelationships.filter((r) => r.productInstanceId === inst.id) ?? [];
              return (
                <tr key={inst.id}>
                  <td>{inst.sku?.code}</td>
                  <td>{inst.sku?.category}</td>
                  <td>{inst.quantity}</td>
                  <td>{inst.z ?? "—"}</td>
                  <td>{rels.length ? rels.map((r) => r.relationshipType).join(", ") : "none"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {instances.length === 0 && <p style={{ color: "#888" }}>No products placed yet.</p>}
      </div>

      {instances.length >= 2 && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Link Product to Product</h2>
          <div className="form-row">
            <div className="field">
              <label>From (requiring)</label>
              <select value={fromInstanceId} onChange={(e) => setFromInstanceId(e.target.value)}>
                <option value="">Select…</option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.sku?.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Edge Type</label>
              <select value={edgeType} onChange={(e) => setEdgeType(e.target.value)}>
                {["REQUIRES", "CONNECTS", "TERMINATES", "SUPPORTS", "INTERACTS"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>To (required)</label>
              <select value={toInstanceId} onChange={(e) => setToInstanceId(e.target.value)}>
                <option value="">Select…</option>
                {instances.filter((i) => i.id !== fromInstanceId).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.sku?.code}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              disabled={!fromInstanceId || !toInstanceId || linkInstancesMutation.isPending}
              onClick={() => linkInstancesMutation.mutate()}
            >
              Link
            </button>
          </div>
          <p style={{ color: "#888", fontSize: 13 }}>
            If the SKU Master defines this exact requirement, the link is automatically traced back to that catalog rule.
          </p>
        </div>
      )}
    </div>
  );
}
