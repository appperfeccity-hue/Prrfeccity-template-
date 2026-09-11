"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api/client";

/**
 * UI-M6a: wall create/replace form, ported near-verbatim from the old
 * WallSection.tsx -- DesignStage already renders the wall itself, so this
 * panel owns only the form, not a canvas. Unconditional/always-visible
 * (not selection-gated) because DesignStage renders nothing selectable
 * until a wall exists (see DesignStage.tsx's "Configure the wall first"
 * guard). No pushAction/undo here -- the original form never had it either,
 * a pre-existing gap this port preserves rather than silently fixes.
 */
export function WallFormPanel({ designId: id, isDraft }: { designId: string; isDraft: boolean }) {
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });

  const wallNode = designQuery.data?.geometryNodes.find((n) => n.nodeType === "WALL");

  const [wallType, setWallType] = useState<"STRAIGHT_LTR" | "STRAIGHT_RTL" | "L_TYPE">("STRAIGHT_LTR");
  const [lengthMm, setLengthMm] = useState(3000);
  const [heightMm, setHeightMm] = useState(2400);

  const mutation = useMutation({
    mutationFn: () => api.setWall(id, { wallType, lengthMm, heightMm }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", id] }),
  });

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Wall Configuration</h2>
      <div className="form-row">
        <div className="field">
          <label>Wall Type</label>
          <select value={wallType} onChange={(e) => setWallType(e.target.value as typeof wallType)}>
            <option value="STRAIGHT_LTR">Straight (Left → Right)</option>
            <option value="STRAIGHT_RTL">Straight (Right → Left)</option>
            <option value="L_TYPE">L-Type (90° corner)</option>
          </select>
        </div>
        <div className="field">
          <label>Length (mm)</label>
          <input type="number" value={lengthMm} onChange={(e) => setLengthMm(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Height (mm)</label>
          <input type="number" value={heightMm} onChange={(e) => setHeightMm(Number(e.target.value))} />
        </div>
        <button className="btn" disabled={!isDraft || mutation.isPending} onClick={() => mutation.mutate()}>
          {wallNode ? "Replace Wall" : "Create Wall"}
        </button>
      </div>
      {mutation.isError && <p className="issue-error">{(mutation.error as Error).message}</p>}
    </div>
  );
}
