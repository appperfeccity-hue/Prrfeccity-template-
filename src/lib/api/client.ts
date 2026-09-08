import type {
  CategoryModel as Category,
  DesignModel as Design,
  DesignValidationResultModel as DesignValidationResult,
  GeometryEdgeModel as GeometryEdge,
  GeometryEdgeRelationshipModel as GeometryEdgeRelationship,
  GeometryNodeModel as GeometryNode,
  GeometryProductRelationshipModel as GeometryProductRelationship,
  LookModel as Look,
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
import type { ValidationIssue } from "@/lib/types";
import type { BomLineInput } from "@/lib/graph/bom";

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

export type { Look };

export type SkuWithCategory = SkuMaster & { category: Category };

export type FullDesign = Design & {
  geometryNodes: (GeometryNode & { wall: Wall | null; zone: Zone | null; partition: ZonePartition | null; panel: Panel | null; edges: GeometryEdge[] })[];
  geometryEdgeRelationships: GeometryEdgeRelationship[];
  productInstances: (ProductInstance & { sku: SkuWithCategory })[];
  productInstanceEdges: ProductInstanceEdge[];
  geometryProductRelationships: GeometryProductRelationship[];
  templateParameters: (TemplateParameter & { permission: ConsultantPermission | null })[];
  validationResults: DesignValidationResult[];
  masterBoms: (MasterBom & { lines: unknown[] })[];
};

export type GeometryEdgeRelationshipTypeValue =
  | "ADJACENT_TO"
  | "MEETS"
  | "CONTINUES_TO"
  | "SHARES_BOUNDARY"
  | "TERMINATES_AT";

export type QuantityRule =
  | { type: "FIXED"; value: number }
  | { type: "PER_LENGTH_MM"; perMm: number }
  | null;

export type RelationshipOriginValue = "DESIGNER_DEFINED" | "CATALOG_DERIVED";

export type LibraryRoomTypeValue = "LIVING_ROOM" | "TV_UNIT" | "BEDROOM";

export const api = {
  listDesigns: () => request<Design[]>("GET", "/designs"),
  createDesign: (data: { name: string; description?: string; tags?: string[] }) =>
    request<Design>("POST", "/designs", data),
  getDesign: (id: string) => request<FullDesign>("GET", `/designs/${id}`),
  updateDesign: (
    id: string,
    data: {
      libraryRoomType?: LibraryRoomTypeValue | null;
      lookId?: string | null;
      pricePerSqFt?: number | null;
      areaSqFt?: number | null;
      isFavorited?: boolean;
    },
  ) => request<Design>("PATCH", `/designs/${id}`, data),
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

  deleteZone: (id: string, zoneId: string) =>
    request<void>("DELETE", `/designs/${id}/zones/${zoneId}`),

  createGeometryEdgeRelationship: (
    id: string,
    data: { edgeAId: string; edgeBId: string; relationshipType: GeometryEdgeRelationshipTypeValue },
  ) => request<GeometryEdgeRelationship>("POST", `/designs/${id}/geometry-edge-relationships`, data),

  deleteGeometryEdgeRelationship: (id: string, relationshipId: string) =>
    request<void>("DELETE", `/designs/${id}/geometry-edge-relationships/${relationshipId}`),

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

  updatePanel: (id: string, panelId: string, data: { widthMm?: number; orientation?: string }) =>
    request<Panel>("PATCH", `/designs/${id}/panels/${panelId}`, data),

  autoFillPartition: (id: string, partitionId: string, skuId: string) =>
    request<{
      partition: ZonePartition;
      panels: { panel: Panel; edges: GeometryEdge[]; productInstance: ProductInstance | null }[];
      fill: { count: number; panelWidthMm: number; remainderMm: number; hasOffcut: boolean; offcutReusable: boolean | null };
    }>("POST", `/designs/${id}/partitions/${partitionId}/autofill`, { skuId }),

  deleteGeometryNode: (id: string, nodeId: string) =>
    request<void>("DELETE", `/designs/${id}/geometry-nodes/${nodeId}`),

  listCategories: () => request<Category[]>("GET", "/categories"),
  listLooks: () => request<Look[]>("GET", "/looks"),

  listSkus: (category?: string) =>
    request<SkuWithCategory[]>("GET", `/skus${category ? `?category=${category}` : ""}`),
  getSku: (skuId: string) =>
    request<
      SkuWithCategory & {
        edgesFrom: (SkuEdge & { toSku: SkuWithCategory })[];
        edgesTo: (SkuEdge & { fromSku: SkuWithCategory })[];
      }
    >("GET", `/skus/${skuId}`),

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

  updateProductInstance: (
    id: string,
    instanceId: string,
    data: { x?: number; y?: number; z?: number; rotationDeg?: number; quantity?: number },
  ) => request<ProductInstance>("PATCH", `/designs/${id}/product-instances/${instanceId}`, data),

  deleteProductInstance: (id: string, instanceId: string) =>
    request<void>("DELETE", `/designs/${id}/product-instances/${instanceId}`),

  createGeometryProductRelationship: (
    id: string,
    data: {
      geometryEdgeId?: string;
      geometryNodeId?: string;
      productInstanceId: string;
      relationshipType: string;
      condition?: unknown;
      quantityRule?: QuantityRule;
      origin?: RelationshipOriginValue;
    },
  ) => request<GeometryProductRelationship>("POST", `/designs/${id}/geometry-product-relationships`, data),

  deleteGeometryProductRelationship: (id: string, relationshipId: string) =>
    request<void>("DELETE", `/designs/${id}/geometry-product-relationships/${relationshipId}`),

  createProductInstanceEdge: (
    id: string,
    data: {
      fromInstanceId: string;
      toInstanceId: string;
      edgeType: string;
      sourceSkuEdgeId?: string;
      origin?: RelationshipOriginValue;
    },
  ) => request<ProductInstanceEdge>("POST", `/designs/${id}/product-instance-edges`, data),

  deleteProductInstanceEdge: (id: string, edgeId: string) =>
    request<void>("DELETE", `/designs/${id}/product-instance-edges/${edgeId}`),

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

  deleteTemplateParameter: (id: string, paramId: string) =>
    request<void>("DELETE", `/designs/${id}/parameters/${paramId}`),

  setPermission: (
    id: string,
    paramId: string,
    data: { editableByConsultant: boolean; minValue?: number; maxValue?: number; allowedValues?: string[] },
  ) => request<ConsultantPermission>("PUT", `/designs/${id}/parameters/${paramId}/permission`, data),

  validate: (id: string) => request<DesignValidationResult>("POST", `/designs/${id}/validate`, {}),
  getBom: (id: string) => request<MasterBom & { lines: unknown[] }>("GET", `/designs/${id}/bom`),
  generateBom: (id: string) => request<MasterBom & { lines: unknown[] }>("POST", `/designs/${id}/bom`, {}),
  publish: (id: string) => request<Design>("POST", `/designs/${id}/publish`, {}),

  // Non-persisting live previews -- see /validate/preview and /bom/preview routes.
  previewValidation: (id: string) => request<{ issues: ValidationIssue[]; passed: boolean }>("GET", `/designs/${id}/validate/preview`),
  previewBom: (id: string) => request<{ lines: BomLineInput[] }>("GET", `/designs/${id}/bom/preview`),

  listLibrary: () => request<(Design & { look: Look | null })[]>("GET", "/library"),
  getLibraryEntry: (id: string) => request<FullDesign>("GET", `/library/${id}`),
};
