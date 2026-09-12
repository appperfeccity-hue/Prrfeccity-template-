"use client";

import { useState } from "react";
import type { ConstraintAxisValue, ConstraintTargetKindValue, ConstraintTypeValue } from "@/lib/api/client";

export type ArmedConstraintTarget = { kind: ConstraintTargetKindValue; id: string };

export type ArmedConstraint =
  | { step: "PICK_A"; constraintType: ConstraintTypeValue }
  | { step: "PICK_B"; constraintType: ConstraintTypeValue; targetA: ArmedConstraintTarget }
  | {
      step: "CONFIGURE";
      constraintType: ConstraintTypeValue;
      targetA: ArmedConstraintTarget;
      targetB: ArmedConstraintTarget | null;
    };

export type ConstraintConfig = {
  axis: ConstraintAxisValue;
  valueMm?: number;
  minValueMm?: number;
  maxValueMm?: number;
};

const CONSTRAINT_TYPE_LABELS: Record<ConstraintTypeValue, string> = {
  DISTANCE: "Distance — exact separation between two targets",
  ALIGN: "Align — same coordinate along an axis",
  EQUAL: "Equal — same width/height",
  MIN_MAX: "Min/Max — separation within a range",
  CENTER: "Center — one target centered within another",
  EDGE_TO_EDGE: "Edge to Edge — exact gap between two spans",
  FIXED_POSITION: "Fixed Position — one target pinned to an absolute mm value",
};

const TARGET_KIND_LABELS: Record<ConstraintTargetKindValue, string> = {
  FIXTURE: "Fixture",
  PRODUCT_INSTANCE: "Product instance",
  GEOMETRY_NODE: "Wall segment",
  GEOMETRY_EDGE: "Wall edge",
};

/**
 * Click-to-pick-on-canvas Constraint authoring -- extends the arm-then-click
 * pattern FurnitureCatalogue/FixturePalette already established. Armed
 * state (which pick step we're on, and the picked targets so far) lives in
 * the parent (DesignStageSection), not here, because DesignStage's
 * `pickTarget` prop needs to write into it as the Designer clicks the
 * canvas -- this component is a controlled view over that state plus the
 * final numeric config form.
 */
export function ConstraintPalette({
  armed,
  onStart,
  onCancel,
  onCreate,
  isPending,
  error,
}: {
  armed: ArmedConstraint | null;
  onStart: (constraintType: ConstraintTypeValue) => void;
  onCancel: () => void;
  onCreate: (config: ConstraintConfig) => void;
  isPending?: boolean;
  error?: string | null;
}) {
  const [pendingType, setPendingType] = useState<ConstraintTypeValue>("DISTANCE");
  const [axis, setAxis] = useState<ConstraintAxisValue>("X");
  const [valueMm, setValueMm] = useState(100);
  const [minValueMm, setMinValueMm] = useState(0);
  const [maxValueMm, setMaxValueMm] = useState(100);

  if (!armed) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add Constraint</h2>
        <p style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
          A stored spatial fact between two targets, checked (never auto-corrected) by validation. Pick a type, then
          click targets on the canvas.
        </p>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/50">Type</span>
            <select value={pendingType} onChange={(e) => setPendingType(e.target.value as ConstraintTypeValue)}>
              {Object.entries(CONSTRAINT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => onStart(pendingType)}>
            Start
          </button>
        </div>
      </div>
    );
  }

  if (armed.step === "PICK_A" || armed.step === "PICK_B") {
    return (
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add Constraint — {CONSTRAINT_TYPE_LABELS[armed.constraintType]}</h2>
        {armed.step === "PICK_A" ? (
          <p className="text-green-600 text-xs">Click target A on the canvas.</p>
        ) : (
          <p className="text-green-600 text-xs">
            Target A: {TARGET_KIND_LABELS[armed.targetA.kind]}. Now click target B on the canvas.
          </p>
        )}
        <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  // step === "CONFIGURE"
  const needsValue = armed.constraintType === "DISTANCE" || armed.constraintType === "EDGE_TO_EDGE" || armed.constraintType === "FIXED_POSITION";
  const needsMinMax = armed.constraintType === "MIN_MAX";

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Configure Constraint — {CONSTRAINT_TYPE_LABELS[armed.constraintType]}</h2>
      <p style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
        Target A: {TARGET_KIND_LABELS[armed.targetA.kind]}
        {armed.targetB && ` · Target B: ${TARGET_KIND_LABELS[armed.targetB.kind]}`}
      </p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Axis</span>
          <select value={axis} onChange={(e) => setAxis(e.target.value as ConstraintAxisValue)}>
            <option value="X">X</option>
            <option value="Y">Y</option>
          </select>
        </label>

        {needsValue && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/50">Value (mm)</span>
            <input type="number" value={valueMm} onChange={(e) => setValueMm(Number(e.target.value))} />
          </label>
        )}

        {needsMinMax && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Min (mm)</span>
              <input type="number" value={minValueMm} onChange={(e) => setMinValueMm(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-foreground/50">Max (mm)</span>
              <input type="number" value={maxValueMm} onChange={(e) => setMaxValueMm(Number(e.target.value))} />
            </label>
          </>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="btn"
            disabled={isPending}
            onClick={() =>
              onCreate({
                axis,
                valueMm: needsValue ? valueMm : undefined,
                minValueMm: needsMinMax ? minValueMm : undefined,
                maxValueMm: needsMinMax ? maxValueMm : undefined,
              })
            }
          >
            Create Constraint
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
        {error && <p className="issue-error">{error}</p>}
      </div>
    </div>
  );
}
