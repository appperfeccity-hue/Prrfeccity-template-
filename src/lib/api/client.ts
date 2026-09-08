import type {
  DesignModel as Design,
  DesignValidationResultModel as DesignValidationResult,
  GeometryEdgeModel as GeometryEdge,
  GeometryEdgeRelationshipModel as GeometryEdgeRelationship,
  GeometryNodeModel as GeometryNode,
  GeometryProductRelationshipModel as GeometryProductRelationship,
  MasterBomModel as MasterBom,
  PanelModel as Panel,
  ProductInstanceModel as ProductInstance,
  ProductInstanceEdgeModel as ProductInstanceEdge,
  SkuEdgeModel as SkuEdge,
  SkuMasterModel as SkuMaster,
  TemplateParameterModel as TemplateParameter,
  ConsultantPermissionModel as ConsultantPermission,
  WallModel as Wall,
  ZoneModel as Zone,
  ZonePartitionModel as ZonePartition,
} from "@/generated/prisma/models";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(json?.error ?? `Request failed with status ${res.status}`);
  }
  return json as T;
}

export type FullDesign = Design & {
  geometryNodes: (GeometryNode & { wall: Wall | null; zone: Zone | null; partition: ZonePartition | null; panel: Panel | null; edges: GeometryEdge[] })[];
  geometryEdgeRelationships: GeometryEdgeRelationship[];
  productInstances: (ProductInstance & { sku: SkuMaster })[];
  productInstanceEdges: ProductInstanceEdge[];
  geometryProductRelationships: GeometryProductRelationship[];
  templateParameters: (TemplateParameter & { permission: ConsultantPermission | null })[];
  validationResults: DesignValidationResult[];
  masterBoms: (MasterBom & { lines: unknown[] })[];
};

export const api = {
  listDesigns: () => request<Design[]>("GET", "/designs"),
  createDesign: (data: { name: string; description?: string; tags?: string[] }) =>
    request<Design>("POST", "/designs", data),
  getDesign: (id: string) => request<FullDesign>("GET", `/designs/${id}`),
  reviseDesign: (id: string) => request<Design>("POST", `/designs/${id}/revise`),

  setWall: (
    id: string,
    data: { wallType: string; lengthMm: number; heightMm: number; cornerAngleDeg?: number },
  ) => request<{ wall: Wall; edges: GeometryEdge[] }>("PUT", `/designs/${id}/wall`, data),

  listZones: (id: string) => request<Zone[]>("GET", `/designs/${id}/zones`),
  createZone: (
    id: string,
    data: {
      wallId?: string;
      associatesWith: string;
      orderIndex: number;
      widthMm: number;
      heightMm: number;
      hasCoveLighting?: boolean;
      coveLightZMm?: number;
    },
  ) => request<{ zone: Zone; edges: GeometryEdge[] }>("POST", `/designs/${id}/zones`, data),

  createGeometryEdgeRelationship: (
    id: string,
    data: { edgeAId: string; edgeBId: string; relationshipType: "ADJACENCY" },
  ) => request<GeometryEdgeRelationship>("POST", `/designs/${id}/geometry-edge-relationships`, data),

  updateGeometryEdge: (
    id: string,
    edgeId: string,
    data: Partial<
      Pick<GeometryEdge, "requiresTermination" | "requiresConnector" | "requiresTrim" | "isLightingBoundary">
    >,
  ) => request<GeometryEdge>("PUT", `/designs/${id}/geometry-edges/${edgeId}`, data),

  createPartition: (
    id: string,
    zoneId: string,
    data: { orderIndex: number; widthMm: number; heightMm: number },
  ) => request<ZonePartition>("POST", `/designs/${id}/zones/${zoneId}/partitions`, data),

  createPanel: (
    id: string,
    partitionId: string,
    data: { orderIndex: number; widthMm: number; heightMm: number; orientation: string },
  ) => request<{ panel: Panel; edges: GeometryEdge[] }>("POST", `/designs/${id}/partitions/${partitionId}/panels`, data),

  listSkus: (category?: string) =>
    request<SkuMaster[]>("GET", `/skus${category ? `?category=${category}` : ""}`),
  getSku: (skuId: string) =>
    request<SkuMaster & { edgesFrom: (SkuEdge & { toSku: SkuMaster })[]; edgesTo: (SkuEdge & { fromSku: SkuMaster })[] }>(
      "GET",
      `/skus/${skuId}`,
    ),

  createProductInstance: (
    id: string,
    data: {
      skuId: string;
      geometryNodeId?: string;
      x?: number;
      y?: number;
      z?: number;
      rotationDeg?: number;
      quantity?: number;
    },
  ) => request<ProductInstance>("POST", `/designs/${id}/product-instances`, data),

  createGeometryProductRelationship: (
    id: string,
    data: {
      geometryEdgeId?: string;
      geometryNodeId?: string;
      productInstanceId: string;
      relationshipType: string;
    },
  ) => request<GeometryProductRelationship>("POST", `/designs/${id}/geometry-product-relationships`, data),

  createProductInstanceEdge: (
    id: string,
    data: { fromInstanceId: string; toInstanceId: string; edgeType: string; sourceSkuEdgeId?: string },
  ) => request<ProductInstanceEdge>("POST", `/designs/${id}/product-instance-edges`, data),

  createTemplateParameter: (
    id: string,
    data: {
      targetProductInstanceId?: string;
      targetGeometryEdgeId?: string;
      paramKey: string;
      paramType: string;
      label: string;
      defaultValue: string;
      unit?: string;
    },
  ) => request<TemplateParameter>("POST", `/designs/${id}/parameters`, data),

  setPermission: (
    id: string,
    paramId: string,
    data: { editableByConsultant: boolean; minValue?: number; maxValue?: number; allowedValues?: string[] },
  ) => request<ConsultantPermission>("PUT", `/designs/${id}/parameters/${paramId}/permission`, data),

  validate: (id: string) => request<DesignValidationResult>("POST", `/designs/${id}/validate`, {}),
  getBom: (id: string) => request<MasterBom & { lines: unknown[] }>("GET", `/designs/${id}/bom`),
  generateBom: (id: string) => request<MasterBom & { lines: unknown[] }>("POST", `/designs/${id}/bom`, {}),
  publish: (id: string) => request<Design>("POST", `/designs/${id}/publish`, {}),

  listLibrary: () => request<Design[]>("GET", "/library"),
  getLibraryEntry: (id: string) => request<FullDesign>("GET", `/library/${id}`),
};
