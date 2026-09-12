"use client";

import { useState } from "react";
import type { FixtureTypeValue } from "@/lib/api/client";

export type ArmedFixture = {
  fixtureType: FixtureTypeValue;
  label?: string;
  widthMm: number;
  heightMm: number;
  clearanceMm?: number;
};

const FIXTURE_TYPE_LABELS: Record<FixtureTypeValue, string> = {
  TV: "TV",
  AC_UNIT: "AC Unit",
  ELECTRICAL_SOCKET: "Electrical Socket",
  WINDOW: "Window",
  DOOR: "Door",
};

// A UI starting-guess only, never persisted or authoritative -- the
// Designer always overrides it. Not a schema/API concept: Fixtures have no
// catalog, since every instance is a site fact about one specific
// customer's space (see src/lib/graph/fixture.ts).
const TYPE_DEFAULTS: Record<FixtureTypeValue, { widthMm: number; heightMm: number }> = {
  TV: { widthMm: 1200, heightMm: 700 },
  AC_UNIT: { widthMm: 900, heightMm: 300 },
  ELECTRICAL_SOCKET: { widthMm: 100, heightMm: 100 },
  WINDOW: { widthMm: 1200, heightMm: 1200 },
  DOOR: { widthMm: 900, heightMm: 2100 },
};

/**
 * Fixture placement: pick a type + dimensions + clearance, "Add to Canvas"
 * arms placement, then the next canvas click positions it -- the same
 * arm-then-click flow FurnitureCatalogue already established. No cascading
 * catalogue here, unlike furniture: a Fixture has no SKU/options, only
 * Designer-supplied dimensions.
 */
export function FixturePalette({
  armed,
  onArm,
}: {
  armed: ArmedFixture | null;
  onArm: (armed: ArmedFixture) => void;
}) {
  const [fixtureType, setFixtureType] = useState<FixtureTypeValue>("TV");
  const [label, setLabel] = useState("");
  const [widthMm, setWidthMm] = useState(TYPE_DEFAULTS.TV.widthMm);
  const [heightMm, setHeightMm] = useState(TYPE_DEFAULTS.TV.heightMm);
  const [clearanceMm, setClearanceMm] = useState(0);

  const handleTypeChange = (next: FixtureTypeValue) => {
    setFixtureType(next);
    setWidthMm(TYPE_DEFAULTS[next].widthMm);
    setHeightMm(TYPE_DEFAULTS[next].heightMm);
  };

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Add Fixture</h2>
      <p style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
        A site fact (TV, AC unit, socket, window, door) the Designer designs around. Add to Canvas, then click the
        canvas to position it.
      </p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Type</span>
          <select value={fixtureType} onChange={(e) => handleTypeChange(e.target.value as FixtureTypeValue)}>
            {Object.entries(FIXTURE_TYPE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Label (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={FIXTURE_TYPE_LABELS[fixtureType]} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Width (mm)</span>
          <input type="number" value={widthMm} onChange={(e) => setWidthMm(Number(e.target.value))} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Height (mm)</span>
          <input type="number" value={heightMm} onChange={(e) => setHeightMm(Number(e.target.value))} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Clearance (mm)</span>
          <input type="number" value={clearanceMm} onChange={(e) => setClearanceMm(Number(e.target.value))} />
        </label>

        <button
          type="button"
          className="btn"
          disabled={widthMm <= 0 || heightMm <= 0}
          onClick={() =>
            onArm({
              fixtureType,
              label: label || undefined,
              widthMm,
              heightMm,
              clearanceMm: clearanceMm || undefined,
            })
          }
        >
          Add to Canvas
        </button>
        {armed && armed.fixtureType === fixtureType && (
          <p className="text-green-600 text-xs">Armed — click the canvas to position it.</p>
        )}
      </div>
    </div>
  );
}
