"use client";

import { useState } from "react";
import type { FullDesign } from "@/lib/api/client";
import type { CanvasSelection } from "@/lib/canvas/store";
import { toggleOrientation, type FixtureFields, type InstanceOptionIds, type PanelOrientation } from "@/lib/canvas/mutations";
import { EdgeInspectorPanel } from "@/components/canvas/EdgeInspectorPanel";

/**
 * Generalized right-side Inspector (UI-M5) -- one dispatcher over
 * selection.kind, each sub-view showing only the properties valid for that
 * object. Every mutation callback below is owned by DesignStageSection and
 * is the exact same callback (built from the exact same
 * src/lib/canvas/mutations.ts input builders) DesignStage's own canvas
 * interactions call -- Inspector never talks to the API directly and never
 * holds its own copy of domain state, only local *draft* input state before
 * a field is committed (see PanelView/InstanceView below).
 */
export function Inspector({
  designId,
  design,
  selection,
  isDraft,
  onClose,
  onResizePanel,
  onRotatePanel,
  onDeletePanel,
  onMoveFurniture,
  onRotateFurniture,
  onUpdateInstanceQuantity,
  onUpdateInstanceZ,
  onUpdateInstanceOptions,
  onDeleteInstance,
  onDeleteZone,
  onDeletePartition,
  onUpdateFixture,
  onDeleteFixture,
  onDeleteConstraint,
}: {
  designId: string;
  design: FullDesign;
  selection: CanvasSelection;
  isDraft: boolean;
  onClose: () => void;
  onResizePanel: (panelId: string, widthMm: number) => void;
  onRotatePanel: (panelId: string, orientation: PanelOrientation) => void;
  onDeletePanel: (panelId: string) => void;
  onMoveFurniture: (instanceId: string, xMm: number, yMm: number) => void;
  onRotateFurniture: (instanceId: string, rotationDeg: number) => void;
  onUpdateInstanceQuantity: (instanceId: string, quantity: number) => void;
  onUpdateInstanceZ: (instanceId: string, z: number) => void;
  onUpdateInstanceOptions: (instanceId: string, next: InstanceOptionIds) => void;
  onDeleteInstance: (instanceId: string) => void;
  onDeleteZone: (zoneId: string) => void;
  onDeletePartition: (partitionId: string) => void;
  onUpdateFixture: (fixtureId: string, next: FixtureFields) => void;
  onDeleteFixture: (fixtureId: string) => void;
  onDeleteConstraint: (constraintId: string) => void;
}) {
  if (!selection) return null;

  const node = design.geometryNodes.find((n) => n.id === selection.id);

  if (selection.kind === "edge") {
    const edge = design.geometryNodes.flatMap((n) => n.edges).find((e) => e.id === selection.id);
    if (!edge) return null;
    return <EdgeInspectorPanel designId={designId} edge={edge} onClose={onClose} />;
  }

  if (selection.kind === "wall" && node?.wallSegment) {
    const junction = design.wallJunctions.find(
      (j) => j.segmentAId === node.id || j.segmentBId === node.id,
    );
    return (
      <InspectorShell title={`Segment ${node.wallSegment.sequence + 1}`} onClose={onClose}>
        <Field label="Length" value={`${node.wallSegment.lengthMm}mm`} />
        <Field label="Height" value={`${node.wallSegment.heightMm}mm`} />
        {junction && <Field label="Junction angle" value={`${junction.angleDeg}°`} />}
        <p className="text-xs text-foreground/50 mt-2">Edit from the Wall panel above.</p>
      </InspectorShell>
    );
  }

  if (selection.kind === "zone" && node?.zone) {
    return (
      <InspectorShell title={`Zone ${node.zone.orderIndex}`} onClose={onClose}>
        <Field label="Associates with" value={node.zone.associatesWith} />
        <Field label="Width" value={`${node.zone.widthMm}mm`} />
        <Field label="Height" value={`${node.zone.heightMm}mm`} />
        <Field label="Cove lighting" value={node.zone.hasCoveLighting ? "On" : "Off"} />
        <DeleteAction
          disabled={!isDraft}
          onDelete={() => {
            if (!confirm("Delete this zone? This cannot be undone.")) return;
            onDeleteZone(node.id);
            onClose();
          }}
        />
      </InspectorShell>
    );
  }

  if (selection.kind === "partition" && node?.partition) {
    return (
      <InspectorShell title="Partition" onClose={onClose}>
        <Field label="Width" value={`${node.partition.widthMm}mm`} />
        <Field label="Height" value={`${node.partition.heightMm}mm`} />
        <DeleteAction
          disabled={!isDraft}
          onDelete={() => {
            if (!confirm("Delete this partition? This cannot be undone.")) return;
            onDeletePartition(node.id);
            onClose();
          }}
        />
      </InspectorShell>
    );
  }

  if (selection.kind === "panel" && node?.panel) {
    return (
      <PanelView
        key={node.id}
        panel={node.panel}
        panelId={node.id}
        isDraft={isDraft}
        onResizePanel={onResizePanel}
        onRotatePanel={onRotatePanel}
        onDeletePanel={onDeletePanel}
        onClose={onClose}
      />
    );
  }

  if (selection.kind === "instance") {
    const instance = design.productInstances.find((i) => i.id === selection.id);
    if (!instance) return null;
    return (
      <InstanceView
        key={instance.id}
        design={design}
        instance={instance}
        isDraft={isDraft}
        onMoveFurniture={onMoveFurniture}
        onRotateFurniture={onRotateFurniture}
        onUpdateInstanceQuantity={onUpdateInstanceQuantity}
        onUpdateInstanceZ={onUpdateInstanceZ}
        onUpdateInstanceOptions={onUpdateInstanceOptions}
        onDeleteInstance={onDeleteInstance}
        onClose={onClose}
      />
    );
  }

  if (selection.kind === "fixture") {
    const fixture = design.fixtures.find((f) => f.id === selection.id);
    if (!fixture) return null;
    return (
      <FixtureView
        key={fixture.id}
        fixture={fixture}
        isDraft={isDraft}
        onUpdateFixture={onUpdateFixture}
        onDeleteFixture={onDeleteFixture}
        onClose={onClose}
      />
    );
  }

  if (selection.kind === "constraint") {
    const constraint = design.constraints.find((c) => c.id === selection.id);
    if (!constraint) return null;
    return (
      <ConstraintView
        key={constraint.id}
        design={design}
        constraint={constraint}
        isDraft={isDraft}
        onDeleteConstraint={onDeleteConstraint}
        onClose={onClose}
      />
    );
  }

  return null;
}

function InspectorShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="card" style={{ minWidth: 220 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14 }}>{title}</h3>
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex flex-col gap-1 mt-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm gap-4">
      <span className="text-foreground/50">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function DeleteAction({ disabled, onDelete }: { disabled: boolean; onDelete: () => void }) {
  return (
    <button className="btn btn-secondary mt-2" disabled={disabled} onClick={onDelete} title={disabled ? "Published templates are immutable" : undefined}>
      Delete
    </button>
  );
}

function PanelView({
  panel,
  panelId,
  isDraft,
  onResizePanel,
  onRotatePanel,
  onDeletePanel,
  onClose,
}: {
  panel: NonNullable<FullDesign["geometryNodes"][number]["panel"]>;
  panelId: string;
  isDraft: boolean;
  onResizePanel: (panelId: string, widthMm: number) => void;
  onRotatePanel: (panelId: string, orientation: PanelOrientation) => void;
  onDeletePanel: (panelId: string) => void;
  onClose: () => void;
}) {
  const [widthDraft, setWidthDraft] = useState(String(panel.widthMm));

  return (
    <InspectorShell title={`Panel P${panel.orderIndex}`} onClose={onClose}>
      <Field label="Height" value={`${panel.heightMm}mm`} />
      <Field label="Offcut" value={panel.isOffcut ? `Yes${panel.offcutReusable === false ? " (waste)" : ""}` : "No"} />
      <label className="flex flex-col gap-1 text-sm mt-1">
        <span className="text-foreground/50">Width (mm)</span>
        <div className="flex gap-2">
          <input
            type="number"
            value={widthDraft}
            disabled={!isDraft}
            onChange={(e) => setWidthDraft(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-24"
          />
          <button
            className="btn btn-secondary"
            disabled={!isDraft}
            onClick={() => onResizePanel(panelId, Number(widthDraft))}
          >
            Apply
          </button>
        </div>
      </label>
      <button
        className="btn btn-secondary mt-1"
        disabled={!isDraft}
        onClick={() => onRotatePanel(panelId, toggleOrientation(panel.orientation))}
      >
        Rotate ({panel.orientation === "VERTICAL" ? "→ Horizontal" : "→ Vertical"})
      </button>
      <DeleteAction
        disabled={!isDraft}
        onDelete={() => {
          if (!confirm("Delete this panel? This cannot be undone.")) return;
          onDeletePanel(panelId);
          onClose();
        }}
      />
    </InspectorShell>
  );
}

function InstanceView({
  design,
  instance,
  isDraft,
  onMoveFurniture,
  onRotateFurniture,
  onUpdateInstanceQuantity,
  onUpdateInstanceZ,
  onUpdateInstanceOptions,
  onDeleteInstance,
  onClose,
}: {
  design: FullDesign;
  instance: FullDesign["productInstances"][number];
  isDraft: boolean;
  onMoveFurniture: (instanceId: string, xMm: number, yMm: number) => void;
  onRotateFurniture: (instanceId: string, rotationDeg: number) => void;
  onUpdateInstanceQuantity: (instanceId: string, quantity: number) => void;
  onUpdateInstanceZ: (instanceId: string, z: number) => void;
  onUpdateInstanceOptions: (instanceId: string, next: InstanceOptionIds) => void;
  onDeleteInstance: (instanceId: string) => void;
  onClose: () => void;
}) {
  const isFurniture = instance.sku?.category.key === "FURNITURE";
  const canRotate = instance.sku?.rotatable ?? true;
  const [xDraft, setXDraft] = useState(String(instance.x ?? 0));
  const [yDraft, setYDraft] = useState(String(instance.y ?? 0));
  const [rotationDraft, setRotationDraft] = useState(String(instance.rotationDeg ?? 0));
  const [quantityDraft, setQuantityDraft] = useState(String(instance.quantity));
  const [zDraft, setZDraft] = useState(String(instance.z ?? 0));

  const attachedNode = instance.geometryNodeId
    ? design.geometryNodes.find((n) => n.id === instance.geometryNodeId)
    : undefined;
  const attachedLabel = attachedNode
    ? attachedNode.wallSegment
      ? `Segment ${attachedNode.wallSegment.sequence + 1}`
      : attachedNode.zone
        ? `Zone ${attachedNode.zone.orderIndex}`
        : attachedNode.partition
          ? "Partition"
          : attachedNode.panel
            ? `Panel P${attachedNode.panel.orderIndex}`
            : attachedNode.label
    : null;

  return (
    <InspectorShell title={instance.sku?.code ?? "Product"} onClose={onClose}>
      <Field label="Product" value={`${instance.sku?.code ?? "—"} — ${instance.sku?.name ?? "—"}`} />
      <Field label="Category" value={instance.sku?.category.label ?? "—"} />

      {isFurniture && instance.sku && (
        <FurnitureOptionFields
          instanceId={instance.id}
          sku={instance.sku}
          designOptionId={instance.designOptionId}
          colourOptionId={instance.colourOptionId}
          sizeOptionId={instance.sizeOptionId}
          isDraft={isDraft}
          onUpdateInstanceOptions={onUpdateInstanceOptions}
        />
      )}

      {isFurniture && (
        <>
          <label className="flex flex-col gap-1 text-sm mt-1">
            <span className="text-foreground/50">Position (mm)</span>
            <div className="flex gap-2">
              <input type="number" value={xDraft} disabled={!isDraft} onChange={(e) => setXDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
              <input type="number" value={yDraft} disabled={!isDraft} onChange={(e) => setYDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
              <button
                className="btn btn-secondary"
                disabled={!isDraft}
                onClick={() => onMoveFurniture(instance.id, Number(xDraft), Number(yDraft))}
              >
                Apply
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-sm mt-1">
            <span className="text-foreground/50">Rotation (deg){!canRotate ? " -- not permitted for this product" : ""}</span>
            <div className="flex gap-2">
              <input
                type="number"
                value={rotationDraft}
                disabled={!isDraft || !canRotate}
                onChange={(e) => setRotationDraft(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-20"
              />
              <button
                className="btn btn-secondary"
                disabled={!isDraft || !canRotate}
                onClick={() => onRotateFurniture(instance.id, Number(rotationDraft))}
              >
                Apply
              </button>
            </div>
          </label>
          {attachedLabel && <Field label="Attached to" value={attachedLabel} />}
        </>
      )}

      {!isFurniture && (
        <label className="flex flex-col gap-1 text-sm mt-1">
          <span className="text-foreground/50">Z position (mm)</span>
          <div className="flex gap-2">
            <input type="number" value={zDraft} disabled={!isDraft} onChange={(e) => setZDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
            <button className="btn btn-secondary" disabled={!isDraft} onClick={() => onUpdateInstanceZ(instance.id, Number(zDraft))}>
              Apply
            </button>
          </div>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm mt-1">
        <span className="text-foreground/50">Quantity</span>
        <div className="flex gap-2">
          <input type="number" value={quantityDraft} disabled={!isDraft} onChange={(e) => setQuantityDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
          <button className="btn btn-secondary" disabled={!isDraft} onClick={() => onUpdateInstanceQuantity(instance.id, Number(quantityDraft))}>
            Apply
          </button>
        </div>
      </label>

      <DeleteAction
        disabled={!isDraft}
        onDelete={() => {
          if (!confirm("Delete this product? This cannot be undone.")) return;
          onDeleteInstance(instance.id);
          onClose();
        }}
      />
    </InspectorShell>
  );
}

// Design / Colour / Size are read from the Furniture Catalogue (the SKU's
// own option lists), never hard-coded here -- and changing one fires
// immediately (same pattern as the app's other enum-style controls) since
// it's a discrete catalogue-configuration swap, not a value being typed.
// "SKU + Design + Colour + Size -> fixed configuration" is authoritative:
// Fixed dimensions below is always read live off the selected size option,
// never a stored/editable field on the instance.
function FurnitureOptionFields({
  instanceId,
  sku,
  designOptionId,
  colourOptionId,
  sizeOptionId,
  isDraft,
  onUpdateInstanceOptions,
}: {
  instanceId: string;
  sku: NonNullable<FullDesign["productInstances"][number]["sku"]>;
  designOptionId: string | null;
  colourOptionId: string | null;
  sizeOptionId: string | null;
  isDraft: boolean;
  onUpdateInstanceOptions: (instanceId: string, next: InstanceOptionIds) => void;
}) {
  const selectedSize = sku.sizeOptions.find((o) => o.id === sizeOptionId);

  return (
    <>
      {sku.designOptions.length > 0 && (
        <label className="flex flex-col gap-1 text-sm mt-1">
          <span className="text-foreground/50">Design</span>
          <select
            value={designOptionId ?? ""}
            disabled={!isDraft}
            onChange={(e) => onUpdateInstanceOptions(instanceId, { designOptionId: e.target.value })}
          >
            <option value="" disabled>
              Select…
            </option>
            {sku.designOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {sku.colourOptions.length > 0 && (
        <label className="flex flex-col gap-1 text-sm mt-1">
          <span className="text-foreground/50">Colour</span>
          <select
            value={colourOptionId ?? ""}
            disabled={!isDraft}
            onChange={(e) => onUpdateInstanceOptions(instanceId, { colourOptionId: e.target.value })}
          >
            <option value="" disabled>
              Select…
            </option>
            {sku.colourOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {sku.sizeOptions.length > 0 && (
        <label className="flex flex-col gap-1 text-sm mt-1">
          <span className="text-foreground/50">Size</span>
          <select
            value={sizeOptionId ?? ""}
            disabled={!isDraft}
            onChange={(e) => onUpdateInstanceOptions(instanceId, { sizeOptionId: e.target.value })}
          >
            <option value="" disabled>
              Select…
            </option>
            {sku.sizeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedSize && (
        <Field label="Fixed dimensions" value={`${selectedSize.widthMm} × ${selectedSize.depthMm} × ${selectedSize.heightMm}mm`} />
      )}
    </>
  );
}

// Type is read-only -- changing a site fact's kind after placement, while
// dimensions still reflect the old kind, is a confusing UI affordance even
// though the API doesn't forbid it. Delete-and-recreate is the intended
// path for "wrong type" (see src/lib/graph/fixture.ts).
function FixtureView({
  fixture,
  isDraft,
  onUpdateFixture,
  onDeleteFixture,
  onClose,
}: {
  fixture: FullDesign["fixtures"][number];
  isDraft: boolean;
  onUpdateFixture: (fixtureId: string, next: FixtureFields) => void;
  onDeleteFixture: (fixtureId: string) => void;
  onClose: () => void;
}) {
  const [labelDraft, setLabelDraft] = useState(fixture.label ?? "");
  const [widthDraft, setWidthDraft] = useState(String(fixture.widthMm));
  const [heightDraft, setHeightDraft] = useState(String(fixture.heightMm));
  const [clearanceDraft, setClearanceDraft] = useState(String(fixture.clearanceMm));
  const [xDraft, setXDraft] = useState(String(fixture.xMm));
  const [yDraft, setYDraft] = useState(String(fixture.yMm));

  return (
    <InspectorShell title={fixture.label ?? fixture.fixtureType} onClose={onClose}>
      <Field label="Type" value={fixture.fixtureType} />

      <label className="flex flex-col gap-1 text-sm mt-1">
        <span className="text-foreground/50">Label</span>
        <div className="flex gap-2">
          <input
            value={labelDraft}
            disabled={!isDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-32"
          />
          <button
            className="btn btn-secondary"
            disabled={!isDraft}
            onClick={() => onUpdateFixture(fixture.id, { label: labelDraft || null })}
          >
            Apply
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm mt-1">
        <span className="text-foreground/50">Width / Height (mm)</span>
        <div className="flex gap-2">
          <input type="number" value={widthDraft} disabled={!isDraft} onChange={(e) => setWidthDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
          <input type="number" value={heightDraft} disabled={!isDraft} onChange={(e) => setHeightDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
          <button
            className="btn btn-secondary"
            disabled={!isDraft}
            onClick={() => onUpdateFixture(fixture.id, { widthMm: Number(widthDraft), heightMm: Number(heightDraft) })}
          >
            Apply
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm mt-1">
        <span className="text-foreground/50">Clearance (mm)</span>
        <div className="flex gap-2">
          <input
            type="number"
            value={clearanceDraft}
            disabled={!isDraft}
            onChange={(e) => setClearanceDraft(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-20"
          />
          <button
            className="btn btn-secondary"
            disabled={!isDraft}
            onClick={() => onUpdateFixture(fixture.id, { clearanceMm: Number(clearanceDraft) })}
          >
            Apply
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm mt-1">
        <span className="text-foreground/50">Position (mm, top-left)</span>
        <div className="flex gap-2">
          <input type="number" value={xDraft} disabled={!isDraft} onChange={(e) => setXDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
          <input type="number" value={yDraft} disabled={!isDraft} onChange={(e) => setYDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
          <button
            className="btn btn-secondary"
            disabled={!isDraft}
            onClick={() => onUpdateFixture(fixture.id, { xMm: Number(xDraft), yMm: Number(yDraft) })}
          >
            Apply
          </button>
        </div>
      </label>

      <DeleteAction
        disabled={!isDraft}
        onDelete={() => {
          if (!confirm("Delete this fixture? This cannot be undone.")) return;
          onDeleteFixture(fixture.id);
          onClose();
        }}
      />
    </InspectorShell>
  );
}

function resolveConstraintTargetLabel(
  design: FullDesign,
  kind: string | null,
  fixtureId: string | null,
  productInstanceId: string | null,
  geometryNodeId: string | null,
  geometryEdgeId: string | null,
): string {
  if (kind === "FIXTURE") {
    const fx = design.fixtures.find((f) => f.id === fixtureId);
    return fx ? `Fixture: ${fx.label ?? fx.fixtureType}` : "Fixture (deleted)";
  }
  if (kind === "PRODUCT_INSTANCE") {
    const inst = design.productInstances.find((i) => i.id === productInstanceId);
    return inst ? `Product: ${inst.sku?.code ?? "—"}` : "Product (deleted)";
  }
  if (kind === "GEOMETRY_NODE") {
    const node = design.geometryNodes.find((n) => n.id === geometryNodeId);
    return node?.wallSegment ? `Wall Segment ${node.wallSegment.sequence + 1}` : "Wall segment (deleted)";
  }
  if (kind === "GEOMETRY_EDGE") {
    const edge = design.geometryNodes.flatMap((n) => n.edges).find((e) => e.id === geometryEdgeId);
    return edge ? `Wall edge: ${edge.edgeRole}` : "Wall edge (deleted)";
  }
  return "—";
}

// Read-only except Delete -- there is no update endpoint (create/delete
// only, per src/lib/graph/constraint.ts); "wrong constraint" is
// delete-and-recreate, matching FixtureView's own type-is-read-only
// precedent. "Last run" reads the most recently PERSISTED validation
// result only (design.validationResults[0]), same as ConstraintLayer's own
// coloring -- there is no live per-render recompute.
function ConstraintView({
  design,
  constraint,
  isDraft,
  onDeleteConstraint,
  onClose,
}: {
  design: FullDesign;
  constraint: FullDesign["constraints"][number];
  isDraft: boolean;
  onDeleteConstraint: (constraintId: string) => void;
  onClose: () => void;
}) {
  const targetALabel = resolveConstraintTargetLabel(
    design,
    constraint.targetAKind,
    constraint.targetAFixtureId,
    constraint.targetAProductInstanceId,
    constraint.targetAGeometryNodeId,
    constraint.targetAGeometryEdgeId,
  );
  const targetBLabel = constraint.targetBKind
    ? resolveConstraintTargetLabel(
        design,
        constraint.targetBKind,
        constraint.targetBFixtureId,
        constraint.targetBProductInstanceId,
        constraint.targetBGeometryNodeId,
        constraint.targetBGeometryEdgeId,
      )
    : null;

  const latestIssues = ((design.validationResults[0]?.issues as unknown as { code: string; refId?: string }[]) ?? []);
  const hasRun = design.validationResults.length > 0;
  const violated = latestIssues.some((i) => i.code === "CONSTRAINT_SATISFIED" && i.refId === constraint.id);
  const lastRunStatus = !hasRun ? "Not yet validated" : violated ? "Violated" : "Satisfied";

  return (
    <InspectorShell title={`Constraint: ${constraint.constraintType}`} onClose={onClose}>
      <Field label="Target A" value={targetALabel} />
      {targetBLabel && <Field label="Target B" value={targetBLabel} />}
      <Field label="Axis" value={constraint.axis} />
      {constraint.valueMm != null && <Field label="Value" value={`${constraint.valueMm}mm`} />}
      {constraint.minValueMm != null && <Field label="Min" value={`${constraint.minValueMm}mm`} />}
      {constraint.maxValueMm != null && <Field label="Max" value={`${constraint.maxValueMm}mm`} />}
      <Field label="Last run" value={lastRunStatus} />
      <DeleteAction
        disabled={!isDraft}
        onDelete={() => {
          if (!confirm("Delete this constraint? This cannot be undone.")) return;
          onDeleteConstraint(constraint.id);
          onClose();
        }}
      />
    </InspectorShell>
  );
}
