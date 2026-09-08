"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export default function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });

  const design = designQuery.data;
  const validationPassed = design?.validationResults[0]?.passed === true;
  const hasBom = (design?.masterBoms.length ?? 0) > 0;
  const isDraft = design?.status === "DRAFT";
  const isPublished = design?.status === "PUBLISHED";

  const publishMutation = useMutation({
    mutationFn: () => api.publish(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", id] }),
  });

  const reviseMutation = useMutation({
    mutationFn: () => api.reviseDesign(id),
    onSuccess: (child) => {
      queryClient.invalidateQueries({ queryKey: ["designs"] });
      router.push(`/designs/${child.id}/wall`);
    },
  });

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Publish Checklist</h2>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          <li className={validationPassed ? "" : "issue-error"}>
            {validationPassed ? "✓" : "✗"} Design has passed validation
          </li>
          <li className={hasBom ? "" : "issue-error"}>{hasBom ? "✓" : "✗"} Master BOM generated</li>
        </ul>
        {isDraft && (
          <button
            className="btn"
            disabled={!validationPassed || !hasBom || publishMutation.isPending}
            onClick={() => publishMutation.mutate()}
          >
            Publish to Design Library
          </button>
        )}
        {publishMutation.isError && <p className="issue-error">{(publishMutation.error as Error).message}</p>}
      </div>

      {isPublished && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Published</h2>
          <p style={{ marginBottom: 12 }}>
            This Template is published (v{design?.version}) and is now immutable. To make changes, revise it into a new
            draft version.
          </p>
          <button className="btn btn-secondary" disabled={reviseMutation.isPending} onClick={() => reviseMutation.mutate()}>
            Revise (create v{(design?.version ?? 1) + 1})
          </button>
        </div>
      )}
    </div>
  );
}
