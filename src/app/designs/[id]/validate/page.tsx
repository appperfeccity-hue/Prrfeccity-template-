"use client";

import { use } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { LiveSummaryStrip } from "@/components/layout/LiveSummaryStrip";

export default function ValidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });

  const runMutation = useMutation({
    mutationFn: () => api.validate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", id] }),
  });

  const latest = designQuery.data?.validationResults[0];
  const issues = (latest?.issues ?? []) as {
    code: string;
    severity: "ERROR" | "WARNING";
    message: string;
    refType?: string;
    refId?: string;
  }[];

  return (
    <div>
      <LiveSummaryStrip designId={id} />
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 16 }}>Design Validation</h2>
            {latest && (
              <p style={{ color: latest.passed ? "#16a34a" : "#b91c1c", marginTop: 4 }}>
                {latest.passed ? "Passed" : "Failed"} — last run {new Date(latest.ranAt).toLocaleString()}
              </p>
            )}
          </div>
          <button className="btn" disabled={runMutation.isPending} onClick={() => runMutation.mutate()}>
            Run Validation
          </button>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Issues ({issues.length})</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Code</th>
                <th>Message</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, i) => (
                <tr key={i}>
                  <td className={issue.severity === "ERROR" ? "issue-error" : "issue-warning"}>{issue.severity}</td>
                  <td>{issue.code}</td>
                  <td>{issue.message}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {issue.refType ? `${issue.refType}:${issue.refId}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {latest && issues.length === 0 && <p>No issues found — this design is ready for a Master BOM.</p>}
      {!latest && <p style={{ color: "#888" }}>Run validation to check the design's graph integrity.</p>}
    </div>
  );
}
