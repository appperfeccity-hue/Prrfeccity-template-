"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api/client";

/**
 * Wall Segments/Junctions: create/replace/add-second-segment/edit form.
 * DesignStage already renders each segment's own elevation (via the segment
 * tab bar in DesignStageSection), so this panel owns only the forms, not a
 * canvas. Unconditional/always-visible (not selection-gated), matching the
 * original WallFormPanel's own precedent -- DesignStage renders nothing
 * until at least segment 0 exists. No pushAction/undo here -- the original
 * form never had it either, a pre-existing gap this rework preserves rather
 * than silently fixing.
 */
export function WallFormPanel({ designId: id, isDraft }: { designId: string; isDraft: boolean }) {
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["design", id] });

  const segmentNodes = (designQuery.data?.geometryNodes ?? [])
    .filter((n) => n.nodeType === "WALL" && n.wallSegment)
    .sort((a, b) => a.wallSegment!.sequence - b.wallSegment!.sequence);
  const first = segmentNodes[0]?.wallSegment ?? null;
  const second = segmentNodes[1]?.wallSegment ?? null;
  const junction = designQuery.data?.wallJunctions[0] ?? null;

  const [firstLengthMm, setFirstLengthMm] = useState(3000);
  const [firstHeightMm, setFirstHeightMm] = useState(2400);
  const [secondLengthMm, setSecondLengthMm] = useState(2000);
  const [secondHeightMm, setSecondHeightMm] = useState(2400);
  const [angleDeg, setAngleDeg] = useState(90);
  const [junctionAngleDeg, setJunctionAngleDeg] = useState(junction?.angleDeg ?? 90);

  const createFirstMutation = useMutation({
    mutationFn: () => api.createWallSegment(id, { lengthMm: firstLengthMm, heightMm: firstHeightMm }),
    onSuccess: invalidate,
  });

  const addSecondMutation = useMutation({
    mutationFn: () => api.addWallSegment(id, { lengthMm: secondLengthMm, heightMm: secondHeightMm, angleDeg }),
    onSuccess: invalidate,
  });

  const updateFirstMutation = useMutation({
    mutationFn: (data: { lengthMm?: number; heightMm?: number }) => api.updateWallSegment(id, first!.id, data),
    onSuccess: invalidate,
  });

  const updateSecondMutation = useMutation({
    mutationFn: (data: { lengthMm?: number; heightMm?: number }) => api.updateWallSegment(id, second!.id, data),
    onSuccess: invalidate,
  });

  const updateJunctionMutation = useMutation({
    mutationFn: () => api.updateWallJunction(id, junction!.id, { angleDeg: junctionAngleDeg }),
    onSuccess: invalidate,
  });

  const deleteSecondMutation = useMutation({
    mutationFn: () => api.deleteWallSegment(id, second!.id),
    onSuccess: invalidate,
  });

  if (!first) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Wall Configuration</h2>
        <div className="form-row">
          <div className="field">
            <label>Length (mm)</label>
            <input type="number" value={firstLengthMm} onChange={(e) => setFirstLengthMm(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Height (mm)</label>
            <input type="number" value={firstHeightMm} onChange={(e) => setFirstHeightMm(Number(e.target.value))} />
          </div>
          <button className="btn" disabled={!isDraft || createFirstMutation.isPending} onClick={() => createFirstMutation.mutate()}>
            Create Wall Segment 1
          </button>
        </div>
        {createFirstMutation.isError && <p className="issue-error">{(createFirstMutation.error as Error).message}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Wall Configuration</h2>

      <div className="form-row">
        <div className="field">
          <label>Segment 1 Length (mm)</label>
          <input type="number" defaultValue={first.lengthMm} onBlur={(e) => updateFirstMutation.mutate({ lengthMm: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Segment 1 Height (mm)</label>
          <input type="number" defaultValue={first.heightMm} onBlur={(e) => updateFirstMutation.mutate({ heightMm: Number(e.target.value) })} />
        </div>
        {!second && (
          <div className="field">
            <label>Replace Segment 1</label>
            <div className="flex gap-2">
              <input type="number" value={firstLengthMm} onChange={(e) => setFirstLengthMm(Number(e.target.value))} placeholder="Length" />
              <input type="number" value={firstHeightMm} onChange={(e) => setFirstHeightMm(Number(e.target.value))} placeholder="Height" />
              <button className="btn btn-secondary" disabled={!isDraft || createFirstMutation.isPending} onClick={() => createFirstMutation.mutate()}>
                Replace
              </button>
            </div>
          </div>
        )}
      </div>
      {(createFirstMutation.isError || updateFirstMutation.isError) && (
        <p className="issue-error">{((createFirstMutation.error ?? updateFirstMutation.error) as Error).message}</p>
      )}

      {!second && (
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Add Second Segment: Length (mm)</label>
            <input type="number" value={secondLengthMm} onChange={(e) => setSecondLengthMm(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Height (mm)</label>
            <input type="number" value={secondHeightMm} onChange={(e) => setSecondHeightMm(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Junction Angle (°)</label>
            <input type="number" value={angleDeg} onChange={(e) => setAngleDeg(Number(e.target.value))} />
          </div>
          <button className="btn" disabled={!isDraft || addSecondMutation.isPending} onClick={() => addSecondMutation.mutate()}>
            Add Second Segment
          </button>
        </div>
      )}
      {addSecondMutation.isError && <p className="issue-error">{(addSecondMutation.error as Error).message}</p>}

      {second && (
        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Segment 2 Length (mm)</label>
            <input type="number" defaultValue={second.lengthMm} onBlur={(e) => updateSecondMutation.mutate({ lengthMm: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Segment 2 Height (mm)</label>
            <input type="number" defaultValue={second.heightMm} onBlur={(e) => updateSecondMutation.mutate({ heightMm: Number(e.target.value) })} />
          </div>
          {junction && (
            <div className="field">
              <label>Junction Angle (°)</label>
              <div className="flex gap-2">
                <input type="number" value={junctionAngleDeg} onChange={(e) => setJunctionAngleDeg(Number(e.target.value))} />
                <button className="btn btn-secondary" disabled={!isDraft || updateJunctionMutation.isPending} onClick={() => updateJunctionMutation.mutate()}>
                  Apply
                </button>
              </div>
            </div>
          )}
          <button
            className="btn btn-secondary"
            disabled={!isDraft || deleteSecondMutation.isPending}
            onClick={() => {
              if (confirm("Delete the second wall segment? This cannot be undone.")) deleteSecondMutation.mutate();
            }}
          >
            Delete Segment 2
          </button>
        </div>
      )}
      {(updateSecondMutation.isError || updateJunctionMutation.isError || deleteSecondMutation.isError) && (
        <p className="issue-error">
          {((updateSecondMutation.error ?? updateJunctionMutation.error ?? deleteSecondMutation.error) as Error).message}
        </p>
      )}
    </div>
  );
}
