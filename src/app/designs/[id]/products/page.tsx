"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FullDesign } from "@/lib/api/client";
import { useUndoRedo } from "@/lib/undo-redo";
import { computeSuggestedRelationships } from "@/lib/suggestions";

const RELATIONSHIP_TYPES = ["HAS_TREATMENT", "SUPPORTS", "TERMINATES", "BOUNDARY_OF", "POSITIONED_AT", "ADJACENT_TO"];
const SKU_EDGE_TYPES = [
  "REQUIRES",
  "CONNECTS_TO",
  "TERMINATES_WITH",
  "SUPPORTS",
  "COMPATIBLE_WITH",
  "INTERACTS_WITH",
  "INSTALLED_WITH",
];

export default function ProductsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { pushAction } = useUndoRedo();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const skusQuery = useQuery({ queryKey: ["skus"], queryFn: () => api.listSkus() });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => api.listCategories() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["design", id] });
  const design = designQuery.data;
  const categories = (categoriesQuery.data ?? []).filter((c) => c.key !== "FURNITURE");
  const skus = skusQuery.data?.filter((s) => s.category.key !== "FURNITURE") ?? [];
  const instances = design?.productInstances.filter((pi) => pi.sku?.category.key !== "FURNITURE") ?? [];

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
    mutationFn: async (input: { skuId: string; z: number | undefined; targetKey: string; relationshipType: string }) => {
      const instance = await api.createProductInstance(id, {
        skuId: input.skuId,
        z: input.z,
      });
      let relationshipId: string | null = null;
      if (input.targetKey) {
        const [kind, targetId] = input.targetKey.split(":");
        const relationship = await api.createGeometryProductRelationship(id, {
          geometryEdgeId: kind === "edge" ? targetId : undefined,
          geometryNodeId: kind === "node" ? targetId : undefined,
          productInstanceId: instance.id,
          relationshipType: input.relationshipType,
        });
        relationshipId = relationship.id;
      }
      return { instance, relationshipId };
    },
    onSuccess: (result, input) => {
      setTargetKey("");
      invalidate();
      let currentInstanceId = result.instance.id;
      let currentRelationshipId = result.relationshipId;
      pushAction({
        description: `Place product`,
        undo: async () => {
          if (currentRelationshipId) await api.deleteGeometryProductRelationship(id, currentRelationshipId);
          await api.deleteProductInstance(id, currentInstanceId);
          invalidate();
        },
        redo: async () => {
          const instance = await api.createProductInstance(id, { skuId: input.skuId, z: input.z });
          currentInstanceId = instance.id;
          currentRelationshipId = null;
          if (input.targetKey) {
            const [kind, targetId] = input.targetKey.split(":");
            const relationship = await api.createGeometryProductRelationship(id, {
              geometryEdgeId: kind === "edge" ? targetId : undefined,
              geometryNodeId: kind === "node" ? targetId : undefined,
              productInstanceId: instance.id,
              relationshipType: input.relationshipType,
            });
            currentRelationshipId = relationship.id;
          }
          invalidate();
        },
      });
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
    mutationFn: (input: Parameters<typeof api.createProductInstanceEdge>[1]) =>
      api.createProductInstanceEdge(id, input),
    onSuccess: (result, input) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: `Link product edge (${input.edgeType})`,
        undo: async () => {
          await api.deleteProductInstanceEdge(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createProductInstanceEdge(id, input);
          currentId = r.id;
          invalidate();
        },
      });
    },
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
              {categories.map((cat) => (
                <optgroup key={cat.id} label={cat.label}>
                  {skus.filter((s) => s.categoryId === cat.id).map((s) => (
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
          <button
            className="btn"
            disabled={!selectedSkuId || placeMutation.isPending}
            onClick={() =>
              placeMutation.mutate({
                skuId: selectedSkuId,
                z: z === "" ? undefined : Number(z),
                targetKey,
                relationshipType,
              })
            }
          >
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
              <th>Suggested</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => (
              <ProductInstanceRow
                key={inst.id}
                designId={id}
                instance={inst}
                design={design}
                invalidate={invalidate}
              />
            ))}
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
                {SKU_EDGE_TYPES.map((t) => (
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
              onClick={() => {
                const toInstance = instances.find((i) => i.id === toInstanceId);
                const sourceSkuEdge = skuDetailQuery.data?.edgesFrom.find(
                  (e) => e.edgeType === edgeType && e.toSkuId === toInstance?.skuId,
                );
                linkInstancesMutation.mutate({
                  fromInstanceId,
                  toInstanceId,
                  edgeType,
                  sourceSkuEdgeId: sourceSkuEdge?.id,
                });
              }}
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

function ProductInstanceRow({
  designId,
  instance,
  design,
  invalidate,
}: {
  designId: string;
  instance: FullDesign["productInstances"][number];
  design: FullDesign | undefined;
  invalidate: () => void;
}) {
  const { pushAction } = useUndoRedo();
  const [expanded, setExpanded] = useState(false);
  const skuDetailQuery = useQuery({
    queryKey: ["sku", instance.skuId],
    queryFn: () => api.getSku(instance.skuId),
  });

  const rels = design?.geometryProductRelationships.filter((r) => r.productInstanceId === instance.id) ?? [];
  const suggestions =
    skuDetailQuery.data && design
      ? computeSuggestedRelationships(instance, skuDetailQuery.data, design.productInstanceEdges, design.productInstances)
      : [];

  const acceptSuggestionMutation = useMutation({
    mutationFn: async (s: (typeof suggestions)[number]) => {
      const child = await api.createProductInstance(designId, { skuId: s.toSkuId });
      const edge = await api.createProductInstanceEdge(designId, {
        fromInstanceId: instance.id,
        toInstanceId: child.id,
        edgeType: s.edgeType,
        sourceSkuEdgeId: s.skuEdgeId,
        origin: "CATALOG_DERIVED",
      });
      return { child, edge };
    },
    onSuccess: (result, s) => {
      invalidate();
      let currentChildId = result.child.id;
      let currentEdgeId = result.edge.id;
      pushAction({
        description: `Add suggested ${s.toSkuCode}`,
        undo: async () => {
          await api.deleteProductInstanceEdge(designId, currentEdgeId);
          await api.deleteProductInstance(designId, currentChildId);
          invalidate();
        },
        redo: async () => {
          const child = await api.createProductInstance(designId, { skuId: s.toSkuId });
          const edge = await api.createProductInstanceEdge(designId, {
            fromInstanceId: instance.id,
            toInstanceId: child.id,
            edgeType: s.edgeType,
            sourceSkuEdgeId: s.skuEdgeId,
            origin: "CATALOG_DERIVED",
          });
          currentChildId = child.id;
          currentEdgeId = edge.id;
          invalidate();
        },
      });
    },
  });

  return (
    <>
      <tr>
        <td>{instance.sku?.code}</td>
        <td>{instance.sku?.category.label}</td>
        <td>{instance.quantity}</td>
        <td>{instance.z ?? "—"}</td>
        <td>{rels.length ? rels.map((r) => r.relationshipType).join(", ") : "none"}</td>
        <td>
          {suggestions.length > 0 ? (
            <button className="btn btn-secondary" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Hide" : "View"} suggestions ({suggestions.length})
            </button>
          ) : (
            "—"
          )}
        </td>
        <td>
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (!confirm("Delete this product? This cannot be undone.")) return;
              api.deleteProductInstance(designId, instance.id).then(invalidate);
            }}
          >
            Delete
          </button>
        </td>
      </tr>
      {expanded && suggestions.length > 0 && (
        <tr style={{ background: "#fafafa" }}>
          <td colSpan={7}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
              {suggestions.map((s) => (
                <div key={s.skuEdgeId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span>
                    {s.edgeType} → {s.toSkuCode} — {s.toSkuName}
                  </span>
                  <button
                    className="btn"
                    disabled={acceptSuggestionMutation.isPending}
                    onClick={() => acceptSuggestionMutation.mutate(s)}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
