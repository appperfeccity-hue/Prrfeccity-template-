"use client";

import Link from "next/link";
import { useIsFetching, useIsMutating, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { UndoRedoToolbar } from "@/components/layout/UndoRedoToolbar";

export function CommandHeader({ designId }: { designId: string }) {
  const designQuery = useQuery({ queryKey: ["design", designId], queryFn: () => api.getDesign(designId) });
  const isMutating = useIsMutating() > 0;
  const isFetching = useIsFetching({ queryKey: ["design", designId] }) > 0;

  const design = designQuery.data;
  const validationPassed = design?.validationResults[0]?.passed === true;
  const hasBom = (design?.masterBoms.length ?? 0) > 0;
  const isDraft = design?.status === "DRAFT";
  const isPublished = design?.status === "PUBLISHED";
  const readyToPublish = isDraft && validationPassed && hasBom;

  let blockedReason: string | null = null;
  if (isDraft && !readyToPublish) {
    if (!validationPassed && !hasBom) blockedReason = "Validate and generate a BOM first";
    else if (!validationPassed) blockedReason = "Design has not passed validation";
    else blockedReason = "Master BOM has not been generated";
  }

  const saveStatus = isMutating ? "Saving…" : isFetching ? "Syncing…" : "Saved";

  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold">{design?.name ?? "Loading…"}</h1>
        {design && (
          <span className="badge">
            {design.status} · v{design.version}
          </span>
        )}
        <span className="text-xs text-foreground/50">{saveStatus}</span>
      </div>
      <div className="flex items-center gap-2">
        <UndoRedoToolbar />
        <Link href={`/designs/${designId}/review`} className="btn btn-secondary">
          Validate
        </Link>
        <Link href={`/designs/${designId}/review`} className="btn btn-secondary">
          Preview BOM
        </Link>
        {isPublished ? (
          <span className="badge">Published</span>
        ) : blockedReason ? (
          <span className="flex items-center gap-2 text-xs text-foreground/50">
            <span className="btn opacity-50 cursor-not-allowed">Publish</span>
            {blockedReason}
          </span>
        ) : (
          <Link href={`/designs/${designId}/review`} className="btn">
            Publish
          </Link>
        )}
      </div>
    </div>
  );
}
