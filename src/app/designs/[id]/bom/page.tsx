"use client";

import { use, useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

type BomLine = {
  id: string;
  skuId: string;
  quantity: number;
  unitOfMeasure: string;
  sourceGeometryProductRelationshipId: string | null;
  sourceProductInstanceEdgeId: string | null;
  sourceProductInstanceId: string | null;
};

function provenanceLabel(line: BomLine) {
  if (line.sourceGeometryProductRelationshipId) return `Geometry relationship ${line.sourceGeometryProductRelationshipId}`;
  if (line.sourceProductInstanceEdgeId) return `Product requirement ${line.sourceProductInstanceEdgeId}`;
  if (line.sourceProductInstanceId) return `Standalone placement ${line.sourceProductInstanceId}`;
  return "unknown";
}

export default function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const skusQuery = useQuery({ queryKey: ["skus"], queryFn: () => api.listSkus() });
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => api.generateBom(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", id] }),
  });

  const bom = designQuery.data?.masterBoms[0] as { version: number; lines: BomLine[] } | undefined;
  const skuById = new Map((skusQuery.data ?? []).map((s) => [s.id, s]));

  const grouped = new Map<string, BomLine[]>();
  for (const line of bom?.lines ?? []) {
    const list = grouped.get(line.skuId) ?? [];
    list.push(line);
    grouped.set(line.skuId, list);
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 16 }}>Master BOM</h2>
            {bom && <p style={{ color: "#888" }}>Version {bom.version} · {bom.lines.length} provenance lines</p>}
          </div>
          <button className="btn" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
            Generate BOM
          </button>
        </div>
        {generateMutation.isError && <p className="issue-error">{(generateMutation.error as Error).message}</p>}
      </div>

      {grouped.size > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Category</th>
                <th>Total Qty</th>
                <th>UoM</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...grouped.entries()].map(([skuId, lines]) => {
                const sku = skuById.get(skuId);
                const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
                return (
                  <Fragment key={skuId}>
                    <tr>
                      <td>{sku?.code ?? skuId}</td>
                      <td>{sku?.category}</td>
                      <td>{totalQty}</td>
                      <td>{lines[0].unitOfMeasure}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setExpandedSku(expandedSku === skuId ? null : skuId)}
                        >
                          {expandedSku === skuId ? "Hide" : "View"} provenance ({lines.length})
                        </button>
                      </td>
                    </tr>
                    {expandedSku === skuId &&
                      lines.map((line) => (
                        <tr key={line.id} style={{ background: "#fafafa" }}>
                          <td colSpan={5} style={{ fontSize: 12, fontFamily: "monospace" }}>
                            {line.quantity} {line.unitOfMeasure} ← {provenanceLabel(line)}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!bom && <p style={{ color: "#888" }}>No Master BOM generated yet — run validation first, then generate.</p>}
    </div>
  );
}
