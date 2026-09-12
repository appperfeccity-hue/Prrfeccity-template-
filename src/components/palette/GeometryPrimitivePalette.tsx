"use client";

import { useState } from "react";

type Kind = "RECTANGLE" | "LINE" | "POLYLINE" | "ARC" | "CIRCLE";

export type CreateRectangleInput = { xMm: number; yMm: number; widthMm: number; heightMm: number; rotationDeg?: number; label?: string };
export type CreateLineInput = { startXMm: number; startYMm: number; endXMm: number; endYMm: number; label?: string };
export type CreatePolylineInput = { points: { xMm: number; yMm: number; bulge?: number }[]; closed?: boolean; label?: string };
export type CreateArcInput = { centerXMm: number; centerYMm: number; radiusMm: number; startAngleDeg: number; sweepAngleDeg: number; label?: string };
export type CreateCircleInput = { centerXMm: number; centerYMm: number; radiusMm: number; label?: string };

/**
 * Generalized Geometry System (Phase 6 items 1-2) -- a single consolidated
 * creation form replacing the original LINE-only GeometryPrimitiveLineForm.
 * A Kind dropdown conditionally renders only the relevant fields per kind;
 * one shared "Create" button routes to the matching onCreate* prop. All 5
 * kinds are immediate-submit coordinate entry (never arm-then-click, since
 * none of them have a canvas target to pick), so a dropdown costs nothing
 * in UX terms and keeps DesignStageSection's sidebar from growing a new
 * full card every time another primitive kind gets built out.
 */
export function GeometryPrimitivePalette({
  onCreateRectangle,
  onCreateLine,
  onCreatePolyline,
  onCreateArc,
  onCreateCircle,
  isPending,
  error,
}: {
  onCreateRectangle: (input: CreateRectangleInput) => void;
  onCreateLine: (input: CreateLineInput) => void;
  onCreatePolyline: (input: CreatePolylineInput) => void;
  onCreateArc: (input: CreateArcInput) => void;
  onCreateCircle: (input: CreateCircleInput) => void;
  isPending?: boolean;
  error?: string | null;
}) {
  const [kind, setKind] = useState<Kind>("LINE");
  const [label, setLabel] = useState("");

  // RECTANGLE
  const [rectXMm, setRectXMm] = useState(0);
  const [rectYMm, setRectYMm] = useState(0);
  const [rectWidthMm, setRectWidthMm] = useState(500);
  const [rectHeightMm, setRectHeightMm] = useState(300);
  const [rectRotationDeg, setRectRotationDeg] = useState(0);

  // LINE
  const [startXMm, setStartXMm] = useState(0);
  const [startYMm, setStartYMm] = useState(0);
  const [endXMm, setEndXMm] = useState(1000);
  const [endYMm, setEndYMm] = useState(0);

  // POLYLINE
  const [points, setPoints] = useState([
    { xMm: 0, yMm: 0, bulge: 0 },
    { xMm: 1000, yMm: 0, bulge: 0 },
  ]);
  const [closed, setClosed] = useState(false);

  // ARC
  const [arcCenterXMm, setArcCenterXMm] = useState(0);
  const [arcCenterYMm, setArcCenterYMm] = useState(0);
  const [arcRadiusMm, setArcRadiusMm] = useState(200);
  const [startAngleDeg, setStartAngleDeg] = useState(0);
  const [sweepAngleDeg, setSweepAngleDeg] = useState(90);

  // CIRCLE
  const [circleCenterXMm, setCircleCenterXMm] = useState(0);
  const [circleCenterYMm, setCircleCenterYMm] = useState(0);
  const [circleRadiusMm, setCircleRadiusMm] = useState(100);

  const updatePoint = (index: number, field: "xMm" | "yMm" | "bulge", value: number) => {
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };
  const addPoint = () => setPoints((prev) => [...prev, { xMm: 0, yMm: 0, bulge: 0 }]);
  const removePoint = (index: number) => setPoints((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));

  const handleCreate = () => {
    const l = label || undefined;
    if (kind === "RECTANGLE") {
      onCreateRectangle({ xMm: rectXMm, yMm: rectYMm, widthMm: rectWidthMm, heightMm: rectHeightMm, rotationDeg: rectRotationDeg, label: l });
    } else if (kind === "LINE") {
      onCreateLine({ startXMm, startYMm, endXMm, endYMm, label: l });
    } else if (kind === "POLYLINE") {
      onCreatePolyline({ points, closed, label: l });
    } else if (kind === "ARC") {
      onCreateArc({ centerXMm: arcCenterXMm, centerYMm: arcCenterYMm, radiusMm: arcRadiusMm, startAngleDeg, sweepAngleDeg, label: l });
    } else {
      onCreateCircle({ centerXMm: circleCenterXMm, centerYMm: circleCenterYMm, radiusMm: circleRadiusMm, label: l });
    }
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add Geometry Primitive</h2>
      <p style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
        A freestanding reference shape, positioned directly by coordinates (not click-to-place).
      </p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="RECTANGLE">Rectangle</option>
            <option value="LINE">Line</option>
            <option value="POLYLINE">Polyline</option>
            <option value="ARC">Arc</option>
            <option value="CIRCLE">Circle</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Label (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind} />
        </label>

        {kind === "RECTANGLE" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">X / Y (mm)</span>
              <div className="flex gap-2">
                <input type="number" value={rectXMm} onChange={(e) => setRectXMm(Number(e.target.value))} />
                <input type="number" value={rectYMm} onChange={(e) => setRectYMm(Number(e.target.value))} />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Width / Height (mm)</span>
              <div className="flex gap-2">
                <input type="number" value={rectWidthMm} onChange={(e) => setRectWidthMm(Number(e.target.value))} />
                <input type="number" value={rectHeightMm} onChange={(e) => setRectHeightMm(Number(e.target.value))} />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Rotation (deg)</span>
              <input type="number" value={rectRotationDeg} onChange={(e) => setRectRotationDeg(Number(e.target.value))} />
            </label>
          </>
        )}

        {kind === "LINE" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Start X / Y (mm)</span>
              <div className="flex gap-2">
                <input type="number" value={startXMm} onChange={(e) => setStartXMm(Number(e.target.value))} />
                <input type="number" value={startYMm} onChange={(e) => setStartYMm(Number(e.target.value))} />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">End X / Y (mm)</span>
              <div className="flex gap-2">
                <input type="number" value={endXMm} onChange={(e) => setEndXMm(Number(e.target.value))} />
                <input type="number" value={endYMm} onChange={(e) => setEndYMm(Number(e.target.value))} />
              </div>
            </label>
          </>
        )}

        {kind === "POLYLINE" && (
          <>
            {points.map((p, i) => (
              <label key={i} className="flex flex-col gap-1 text-sm">
                <span className="text-foreground/50">Point {i + 1} (X / Y / Bulge)</span>
                <div className="flex gap-2">
                  <input type="number" value={p.xMm} onChange={(e) => updatePoint(i, "xMm", Number(e.target.value))} />
                  <input type="number" value={p.yMm} onChange={(e) => updatePoint(i, "yMm", Number(e.target.value))} />
                  <input type="number" value={p.bulge} onChange={(e) => updatePoint(i, "bulge", Number(e.target.value))} />
                  <button type="button" className="btn btn-secondary" disabled={points.length <= 2} onClick={() => removePoint(i)}>
                    Remove
                  </button>
                </div>
              </label>
            ))}
            <button type="button" className="btn btn-secondary" onClick={addPoint}>
              Add point
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
              <span className="text-foreground/50">Closed</span>
            </label>
          </>
        )}

        {kind === "ARC" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Center X / Y (mm)</span>
              <div className="flex gap-2">
                <input type="number" value={arcCenterXMm} onChange={(e) => setArcCenterXMm(Number(e.target.value))} />
                <input type="number" value={arcCenterYMm} onChange={(e) => setArcCenterYMm(Number(e.target.value))} />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Radius (mm)</span>
              <input type="number" value={arcRadiusMm} onChange={(e) => setArcRadiusMm(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Start / Sweep (deg)</span>
              <div className="flex gap-2">
                <input type="number" value={startAngleDeg} onChange={(e) => setStartAngleDeg(Number(e.target.value))} />
                <input type="number" value={sweepAngleDeg} onChange={(e) => setSweepAngleDeg(Number(e.target.value))} />
              </div>
            </label>
          </>
        )}

        {kind === "CIRCLE" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Center X / Y (mm)</span>
              <div className="flex gap-2">
                <input type="number" value={circleCenterXMm} onChange={(e) => setCircleCenterXMm(Number(e.target.value))} />
                <input type="number" value={circleCenterYMm} onChange={(e) => setCircleCenterYMm(Number(e.target.value))} />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Radius (mm)</span>
              <input type="number" value={circleRadiusMm} onChange={(e) => setCircleRadiusMm(Number(e.target.value))} />
            </label>
          </>
        )}

        <button type="button" className="btn" disabled={isPending} onClick={handleCreate}>
          Create
        </button>
        {error && <p className="issue-error">{error}</p>}
      </div>
    </div>
  );
}
