"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FullProject } from "@/lib/api/client";

type ProjectInstance = FullProject["productInstances"][number];
type TemplateParam = FullProject["template"]["templateParameters"][number];

function findInstanceParam(params: TemplateParam[], sourceInstanceId: string | null, paramType: string, paramKey?: string) {
  if (!sourceInstanceId) return undefined;
  return params.find(
    (p) => p.targetProductInstanceId === sourceInstanceId && p.paramType === paramType && (paramKey ? p.paramKey === paramKey : true),
  );
}

export function ProjectInstancesSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["project", projectId] });

  const project = projectQuery.data;
  const params = project?.template.templateParameters ?? [];

  const edgeTreatmentParams = params.filter((p) => p.paramType === "EDGE_TREATMENT" && p.permission?.editableByConsultant);

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Product Instances</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Quantity</th>
              <th>Rotation</th>
              <th>Position</th>
              <th>Design / Colour / Size</th>
            </tr>
          </thead>
          <tbody>
            {project?.productInstances.map((instance) => (
              <InstanceRow key={instance.id} projectId={projectId} instance={instance} params={params} onSaved={invalidate} />
            ))}
          </tbody>
        </table>
        {project?.productInstances.length === 0 && <p style={{ color: "#888" }}>No product instances in this Project.</p>}
      </div>

      {edgeTreatmentParams.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Edge Treatments</h2>
          {edgeTreatmentParams.map((param) => (
            <EdgeTreatmentRow key={param.id} projectId={projectId} param={param} onSaved={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstanceRow({
  projectId,
  instance,
  params,
  onSaved,
}: {
  projectId: string;
  instance: ProjectInstance;
  params: TemplateParam[];
  onSaved: () => void;
}) {
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.updateProjectProductInstance>[2]) =>
      api.updateProjectProductInstance(projectId, instance.id, data),
    onSuccess: onSaved,
  });

  const quantityParam = findInstanceParam(params, instance.sourceProductInstanceId, "QUANTITY");
  const rotationParam = findInstanceParam(params, instance.sourceProductInstanceId, "NUMERIC_RANGE");
  const positionParam = findInstanceParam(params, instance.sourceProductInstanceId, "POSITION");
  const skuParam = findInstanceParam(params, instance.sourceProductInstanceId, "SKU_SUBSTITUTION");
  const colourParam = findInstanceParam(params, instance.sourceProductInstanceId, "ENUM_SELECTION", "COLOUR_OPTION");
  const designParam = findInstanceParam(params, instance.sourceProductInstanceId, "ENUM_SELECTION", "DESIGN_OPTION");
  const sizeParam = findInstanceParam(params, instance.sourceProductInstanceId, "ENUM_SELECTION", "SIZE_OPTION");

  return (
    <tr>
      <td>
        {instance.sku.code}
        {!instance.sourceProductInstanceId && (
          <div style={{ fontSize: 11, color: "#888" }}>added via edge treatment</div>
        )}
      </td>
      <td>
        {quantityParam?.permission?.editableByConsultant ? (
          <input
            type="number"
            style={{ width: 64 }}
            defaultValue={instance.quantity}
            onBlur={(e) => mutation.mutate({ quantity: Number(e.target.value) })}
          />
        ) : (
          instance.quantity
        )}
      </td>
      <td>
        {rotationParam?.permission?.editableByConsultant ? (
          <input
            type="number"
            style={{ width: 64 }}
            defaultValue={instance.rotationDeg}
            onBlur={(e) => mutation.mutate({ rotationDeg: Number(e.target.value) })}
          />
        ) : (
          `${instance.rotationDeg}°`
        )}
      </td>
      <td>
        {positionParam?.permission?.editableByConsultant ? (
          <div style={{ display: "flex", gap: 4 }}>
            <input type="number" style={{ width: 56 }} defaultValue={instance.x ?? ""} onBlur={(e) => mutation.mutate({ x: Number(e.target.value) })} placeholder="x" />
            <input type="number" style={{ width: 56 }} defaultValue={instance.y ?? ""} onBlur={(e) => mutation.mutate({ y: Number(e.target.value) })} placeholder="y" />
            <input type="number" style={{ width: 56 }} defaultValue={instance.z ?? ""} onBlur={(e) => mutation.mutate({ z: Number(e.target.value) })} placeholder="z" />
          </div>
        ) : (
          [instance.x, instance.y, instance.z].filter((v) => v != null).join(", ") || "—"
        )}
      </td>
      <td>
        {designParam?.permission?.editableByConsultant && (
          <select
            defaultValue={instance.designOptionId ?? ""}
            onChange={(e) => mutation.mutate({ designOptionId: e.target.value || null })}
          >
            {instance.sku.designOptions
              .filter((o) => designParam.permission!.allowedValues.includes(o.key))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        )}
        {colourParam?.permission?.editableByConsultant && (
          <select
            defaultValue={instance.colourOptionId ?? ""}
            onChange={(e) => mutation.mutate({ colourOptionId: e.target.value || null })}
          >
            {instance.sku.colourOptions
              .filter((o) => colourParam.permission!.allowedValues.includes(o.key))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        )}
        {sizeParam?.permission?.editableByConsultant && (
          <select
            defaultValue={instance.sizeOptionId ?? ""}
            onChange={(e) => mutation.mutate({ sizeOptionId: e.target.value || null })}
          >
            {instance.sku.sizeOptions
              .filter((o) => sizeParam.permission!.allowedValues.includes(o.key))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        )}
        {skuParam?.permission?.editableByConsultant && (
          <SkuSubstitutionSelect currentSkuId={instance.skuId} allowedCodes={skuParam.permission!.allowedValues} onChange={(skuId) => mutation.mutate({ skuId })} />
        )}
        {!designParam && !colourParam && !sizeParam && !skuParam && "—"}
      </td>
    </tr>
  );
}

function SkuSubstitutionSelect({
  currentSkuId,
  allowedCodes,
  onChange,
}: {
  currentSkuId: string;
  allowedCodes: string[];
  onChange: (skuId: string) => void;
}) {
  const skusQuery = useQuery({ queryKey: ["skus"], queryFn: () => api.listSkus() });
  const allowedSkus = (skusQuery.data ?? []).filter((s) => allowedCodes.includes(s.code));

  return (
    <select defaultValue={currentSkuId} onChange={(e) => onChange(e.target.value)}>
      {allowedSkus.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code}
        </option>
      ))}
    </select>
  );
}

function EdgeTreatmentRow({
  projectId,
  param,
  onSaved,
}: {
  projectId: string;
  param: TemplateParam;
  onSaved: () => void;
}) {
  const skusQuery = useQuery({ queryKey: ["skus"], queryFn: () => api.listSkus() });
  const allowedSkus = (skusQuery.data ?? []).filter((s) => param.permission?.allowedValues.includes(s.code));

  const mutation = useMutation({
    mutationFn: (skuId: string) => api.setProjectEdgeTreatment(projectId, param.targetGeometryEdgeId!, skuId),
    onSuccess: onSaved,
  });

  return (
    <div className="form-row" style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: 8 }}>
      <div className="field">
        <label>{param.label}</label>
        <select defaultValue="" onChange={(e) => e.target.value && mutation.mutate(e.target.value)}>
          <option value="">Choose a treatment…</option>
          {allowedSkus.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code}
            </option>
          ))}
        </select>
      </div>
      {mutation.isError && <p className="issue-error">{(mutation.error as Error).message}</p>}
    </div>
  );
}

