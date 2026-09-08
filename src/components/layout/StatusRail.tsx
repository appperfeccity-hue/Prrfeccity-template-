"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

function Item({ href, label, value, tone }: { href: string; label: string; value: string; tone?: "ok" | "warn" | "muted" }) {
  const color =
    tone === "ok" ? "text-green-600 dark:text-green-500" : tone === "warn" ? "text-amber-600 dark:text-amber-500" : "text-foreground/50";
  return (
    <Link href={href} className="flex items-baseline gap-1 hover:opacity-75">
      <span className="text-foreground/70">{label}</span>
      <span className={color}>{value}</span>
    </Link>
  );
}

/**
 * A clickable, non-sequential progress readout -- an observability tool, not
 * a wizard. Counts are derived from data already fetched for the design
 * (geometryNodes/templateParameters) plus the existing non-persisting
 * live-preview queries (see LiveSummaryStrip for the same query keys) --
 * no new endpoints.
 */
export function StatusRail({ designId }: { designId: string }) {
  const designQuery = useQuery({ queryKey: ["design", designId], queryFn: () => api.getDesign(designId) });
  const validateQuery = useQuery({
    queryKey: ["design", designId, "live-validate"],
    queryFn: () => api.previewValidation(designId),
  });
  const bomQuery = useQuery({ queryKey: ["design", designId, "live-bom"], queryFn: () => api.previewBom(designId) });

  const design = designQuery.data;
  if (!design) return null;

  const hasWall = design.geometryNodes.some((n) => n.nodeType === "WALL");
  const zones = design.geometryNodes.filter((n) => n.nodeType === "ZONE");
  const partitions = design.geometryNodes.filter((n) => n.nodeType === "PARTITION");
  const panels = design.geometryNodes.filter((n) => n.nodeType === "PANEL");
  const emptyPartitions = partitions.filter((p) => !panels.some((pnl) => pnl.panel?.partitionId === p.id));
  const dependencyCount = design.geometryProductRelationships.length + design.productInstanceEdges.length;
  const paramCount = design.templateParameters.length;
  const errorCount = validateQuery.data?.issues.filter((i) => i.severity === "ERROR").length ?? 0;
  const bomLineCount = bomQuery.data?.lines.length ?? 0;
  const readyToPublish = errorCount === 0 && bomLineCount > 0 && design.status === "DRAFT";

  const designHref = `/designs/${designId}/design`;
  const configureHref = `/designs/${designId}/configure`;
  const reviewHref = `/designs/${designId}/review`;

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-4">
      <Item href={designHref} label="Geometry" value={hasWall ? "✓" : "—"} tone={hasWall ? "ok" : "muted"} />
      <Item href={designHref} label="Zones" value={zones.length > 0 ? "✓" : "—"} tone={zones.length > 0 ? "ok" : "muted"} />
      <Item
        href={designHref}
        label="Nesting"
        value={emptyPartitions.length > 0 ? "⚠" : partitions.length > 0 ? "✓" : "—"}
        tone={emptyPartitions.length > 0 ? "warn" : partitions.length > 0 ? "ok" : "muted"}
      />
      <Item href={designHref} label="Dependencies" value={String(dependencyCount)} tone={dependencyCount > 0 ? "ok" : "muted"} />
      <Item href={configureHref} label="Parameters" value={paramCount > 0 ? String(paramCount) : "—"} tone={paramCount > 0 ? "ok" : "muted"} />
      <Item href={reviewHref} label="Validation" value={errorCount > 0 ? String(errorCount) : "✓"} tone={errorCount > 0 ? "warn" : "ok"} />
      <Item href={reviewHref} label="BOM" value={bomLineCount > 0 ? `${bomLineCount} lines` : "—"} tone={bomLineCount > 0 ? "ok" : "muted"} />
      <Item
        href={reviewHref}
        label="Publish"
        value={design.status === "PUBLISHED" ? "Published" : readyToPublish ? "Ready" : "Locked"}
        tone={design.status === "PUBLISHED" || readyToPublish ? "ok" : "muted"}
      />
    </div>
  );
}
