"use client";

import { useState } from "react";

/**
 * Phase 6 item 1: Generalized Geometry System -- a minimal creation form for
 * GeometryPrimitiveLine, deliberately NOT an arm-then-click palette like
 * FixturePalette/FurnitureCatalogue: a freestanding line has no target to
 * pick on the canvas (unlike Constraint), so there's no click-to-pick
 * precedent worth building here. Submitting immediately creates the row.
 */
export function GeometryPrimitiveLineForm({
  onCreate,
  isPending,
  error,
}: {
  onCreate: (input: { startXMm: number; startYMm: number; endXMm: number; endYMm: number; label?: string }) => void;
  isPending?: boolean;
  error?: string | null;
}) {
  const [startXMm, setStartXMm] = useState(0);
  const [startYMm, setStartYMm] = useState(0);
  const [endXMm, setEndXMm] = useState(1000);
  const [endYMm, setEndYMm] = useState(0);
  const [label, setLabel] = useState("");

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add Line</h2>
      <p style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
        A freestanding reference line, positioned directly by coordinates (not click-to-place).
      </p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Label (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Line" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Start X (mm)</span>
          <input type="number" value={startXMm} onChange={(e) => setStartXMm(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Start Y (mm)</span>
          <input type="number" value={startYMm} onChange={(e) => setStartYMm(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">End X (mm)</span>
          <input type="number" value={endXMm} onChange={(e) => setEndXMm(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">End Y (mm)</span>
          <input type="number" value={endYMm} onChange={(e) => setEndYMm(Number(e.target.value))} />
        </label>

        <button
          type="button"
          className="btn"
          disabled={isPending}
          onClick={() => onCreate({ startXMm, startYMm, endXMm, endYMm, label: label || undefined })}
        >
          Create Line
        </button>
        {error && <p className="issue-error">{error}</p>}
      </div>
    </div>
  );
}
