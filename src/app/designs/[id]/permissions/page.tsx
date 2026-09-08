"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FullDesign } from "@/lib/api/client";

export default function PermissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["design", id] });

  const design = designQuery.data;
  const instances = design?.productInstances ?? [];

  const [paramKey, setParamKey] = useState("PANEL_WIDTH");
  const [label, setLabel] = useState("Panel Width");
  const [defaultValue, setDefaultValue] = useState("600");
  const [unit, setUnit] = useState("mm");
  const [targetInstanceId, setTargetInstanceId] = useState("");

  const createParamMutation = useMutation({
    mutationFn: () =>
      api.createTemplateParameter(id, {
        paramKey,
        paramType: "NUMERIC_RANGE",
        label,
        defaultValue,
        unit,
        targetProductInstanceId: targetInstanceId || undefined,
      }),
    onSuccess: invalidate,
  });

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>New Consultant Parameter</h2>
        <div className="form-row">
          <div className="field">
            <label>Key</label>
            <input value={paramKey} onChange={(e) => setParamKey(e.target.value)} />
          </div>
          <div className="field">
            <label>Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="field">
            <label>Default Value</label>
            <input value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} />
          </div>
          <div className="field">
            <label>Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="field">
            <label>Target instance (optional)</label>
            <select value={targetInstanceId} onChange={(e) => setTargetInstanceId(e.target.value)}>
              <option value="">None</option>
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.sku?.code}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" disabled={!paramKey || createParamMutation.isPending} onClick={() => createParamMutation.mutate()}>
            Add Parameter
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Parameters</h2>
        {design?.templateParameters.map((param) => (
          <PermissionRow key={param.id} designId={id} param={param} onSaved={invalidate} />
        ))}
        {design?.templateParameters.length === 0 && <p style={{ color: "#888" }}>No parameters defined yet.</p>}
      </div>
    </div>
  );
}

function PermissionRow({
  designId,
  param,
  onSaved,
}: {
  designId: string;
  param: FullDesign["templateParameters"][number];
  onSaved: () => void;
}) {
  const [editable, setEditable] = useState(param.permission?.editableByConsultant ?? false);
  const [min, setMin] = useState(param.permission?.minValue?.toString() ?? "");
  const [max, setMax] = useState(param.permission?.maxValue?.toString() ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      api.setPermission(designId, param.id, {
        editableByConsultant: editable,
        minValue: min === "" ? undefined : Number(min),
        maxValue: max === "" ? undefined : Number(max),
      }),
    onSuccess: onSaved,
  });

  return (
    <div className="form-row" style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 8 }}>
      <div className="field">
        <label>Parameter</label>
        <strong>
          {param.label} = {param.defaultValue}
          {param.unit}
        </strong>
      </div>
      <div className="field">
        <label>
          <input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} /> Editable by Consultant
        </label>
      </div>
      <div className="field">
        <label>Min</label>
        <input value={min} onChange={(e) => setMin(e.target.value)} />
      </div>
      <div className="field">
        <label>Max</label>
        <input value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <button className="btn btn-secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        Save
      </button>
    </div>
  );
}
