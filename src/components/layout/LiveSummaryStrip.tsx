"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

/**
 * A live, non-persisting preview of validation/BOM state, distinct from the
 * "last run"/"last generated" persisted rows shown elsewhere on these pages.
 * Recomputes automatically after any mutation: React Query's default
 * partial-key invalidation means every existing `invalidateQueries({
 * queryKey: ["design", id] })` call across the app (every mutation success
 * handler already uses exactly that key) also refreshes these two queries,
 * since they're keyed as children of that same root -- no changes needed at
 * any of those call sites.
 */
export function LiveSummaryStrip({ designId }: { designId: string }) {
  const validateQuery = useQuery({
    queryKey: ["design", designId, "live-validate"],
    queryFn: () => api.previewValidation(designId),
  });
  const bomQuery = useQuery({
    queryKey: ["design", designId, "live-bom"],
    queryFn: () => api.previewBom(designId),
  });

  if (!validateQuery.data && !bomQuery.data) return null;

  const errorCount = validateQuery.data?.issues.filter((i) => i.severity === "ERROR").length ?? 0;
  const warningCount = validateQuery.data?.issues.filter((i) => i.severity === "WARNING").length ?? 0;

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        fontSize: 12,
        color: "#666",
        padding: "6px 0",
        borderBottom: "1px solid #eee",
        marginBottom: 12,
      }}
    >
      <span style={{ fontWeight: 600, color: "#888" }}>LIVE</span>
      {validateQuery.data && (
        <span style={{ color: validateQuery.data.passed ? "#16a34a" : "#b91c1c" }}>
          {validateQuery.data.passed ? "Passing" : "Failing"}
          {errorCount > 0 ? ` (${errorCount} error${errorCount === 1 ? "" : "s"})` : ""}
          {warningCount > 0 ? ` · ${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""}
        </span>
      )}
      {bomQuery.data && <span>{bomQuery.data.lines.length} BOM line{bomQuery.data.lines.length === 1 ? "" : "s"}</span>}
    </div>
  );
}
