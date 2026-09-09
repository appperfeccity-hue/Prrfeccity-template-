"use client";

import { useState } from "react";
import type { FullDesign } from "@/lib/api/client";
import type { CanvasSelection } from "@/lib/canvas/store";
import { toggleOrientation, type PanelOrientation } from "@/lib/canvas/mutations";
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
  onDeleteInstance,
  onDeleteZone,
  onDeletePartition,
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
  onDeleteInstance: (instanceId: string) => void;
  onDeleteZone: (zoneId: string) => void;
  onDeletePartition: (partitionId: string) => void;
}) {
  if (!selection) return null;

  const node = design.geometryNodes.find((n) => n.id === selection.id);

  if (selection.kind === "edge") {
    const edge = design.geometryNodes.flatMap((n) => n.edges).find((e) => e.id === selection.id);
    if (!edge) return null;
    return <EdgeInspectorPanel designId={designId} edge={edge} onClose={onClose} />;
  }

  if (selection.kind === "wall" && node?.wall) {
    return (
      <InspectorShell title="Wall" onClose={onClose}>
        <Field label="Type" value={node.wall.wallType} />
        <Field label="Length" value={`${node.wall.lengthMm}mm`} />
        <Field label="Height" value={`${node.wall.heightMm}mm`} />
        <p className="text-xs text-foreground/50 mt-2">Edit from the Wall section below.</p>
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
        instance={instance}
        isDraft={isDraft}
        onMoveFurniture={onMoveFurniture}
        onRotateFurniture={onRotateFurniture}
        onUpdateInstanceQuantity={onUpdateInstanceQuantity}
        onUpdateInstanceZ={onUpdateInstanceZ}
        onDeleteInstance={onDeleteInstance}
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
  instance,
  isDraft,
  onMoveFurniture,
  onRotateFurniture,
  onUpdateInstanceQuantity,
  onUpdateInstanceZ,
  onDeleteInstance,
  onClose,
}: {
  instance: FullDesign["productInstances"][number];
  isDraft: boolean;
  onMoveFurniture: (instanceId: string, xMm: number, yMm: number) => void;
  onRotateFurniture: (instanceId: string, rotationDeg: number) => void;
  onUpdateInstanceQuantity: (instanceId: string, quantity: number) => void;
  onUpdateInstanceZ: (instanceId: string, z: number) => void;
  onDeleteInstance: (instanceId: string) => void;
  onClose: () => void;
}) {
  const isFurniture = instance.sku?.category.key === "FURNITURE";
  const [xDraft, setXDraft] = useState(String(instance.x ?? 0));
  const [yDraft, setYDraft] = useState(String(instance.y ?? 0));
  const [rotationDraft, setRotationDraft] = useState(String(instance.rotationDeg ?? 0));
  const [quantityDraft, setQuantityDraft] = useState(String(instance.quantity));
  const [zDraft, setZDraft] = useState(String(instance.z ?? 0));

  return (
    <InspectorShell title={instance.sku?.code ?? "Product"} onClose={onClose}>
      <Field label="SKU" value={instance.sku?.code ?? "—"} />
      <Field label="Name" value={instance.sku?.name ?? "—"} />
      <Field label="Category" value={instance.sku?.category.label ?? "—"} />

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
            <span className="text-foreground/50">Rotation (deg)</span>
            <div className="flex gap-2">
              <input type="number" value={rotationDraft} disabled={!isDraft} onChange={(e) => setRotationDraft(e.target.value)} className="border rounded px-2 py-1 text-sm w-20" />
              <button className="btn btn-secondary" disabled={!isDraft} onClick={() => onRotateFurniture(instance.id, Number(rotationDraft))}>
                Apply
              </button>
            </div>
          </label>
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
        <span className="text-foreground/50">
          Quantity{isFurniture ? " (closest thing to “resize” -- placed instances have no width/height field)" : ""}
        </span>
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
