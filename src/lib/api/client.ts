import type {
  CategoryModel as Category,
  DesignModel as Design,
  DesignValidationResultModel as DesignValidationResult,
  FurnitureColourOptionModel as FurnitureColourOption,
  FurnitureDesignOptionModel as FurnitureDesignOption,
  FurnitureSizeOptionModel as FurnitureSizeOption,
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
  WallSegmentModel as WallSegment,
  WallJunctionModel as WallJunction,
  ZoneModel as Zone,
  ZonePartitionModel as ZonePartition,
  ProjectModel as Project,
  ProjectProductInstanceModel as ProjectProductInstance,
  ProjectProductInstanceEdgeModel as ProjectProductInstanceEdge,
  ProjectGeometryProductRelationshipModel as ProjectGeometryProductRelationship,
  FinalBomModel as FinalBom,
  FinalBomLineModel as FinalBomLine,
  FixtureModel as Fixture,
  ConstraintModel as Constraint,
  GeometryPrimitiveLineModel as GeometryPrimitiveLine,
  GeometryPrimitiveRectangleModel as GeometryPrimitiveRectangle,
  GeometryPrimitivePolylineModel as GeometryPrimitivePolyline,
  GeometryPrimitivePolylinePointModel as GeometryPrimitivePolylinePoint,
  GeometryPrimitiveArcModel as GeometryPrimitiveArc,
  GeometryPrimitiveCircleModel as GeometryPrimitiveCircle,
} from "@/generated/prisma/models";
import type { ValidationIssue } from "@/lib/types";
import type { BomLineInput } from "@/lib/graph/bom";
import type { Role } from "@/generated/prisma/client";

export type SafeUser = { id: string; email: string; name: string; role: Role; createdAt: string };

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

export type SkuWithCategory = SkuMaster & {
  category: Category;
  designOptions: FurnitureDesignOption[];
  colourOptions: FurnitureColourOption[];
  sizeOptions: FurnitureSizeOption[];
};

export type FullDesign = Design & {
  geometryNodes: (GeometryNode & {
    wallSegment: WallSegment | null;
    zone: Zone | null;
    partition: ZonePartition | null;
    panel: Panel | null;
    primitiveRectangle: GeometryPrimitiveRectangle | null;
    primitiveLine: GeometryPrimitiveLine | null;
    primitivePolyline: (GeometryPrimitivePolyline & { points: GeometryPrimitivePolylinePoint[] }) | null;
    primitiveArc: GeometryPrimitiveArc | null;
    primitiveCircle: GeometryPrimitiveCircle | null;
    edges: GeometryEdge[];
  })[];
  geometryEdgeRelationships: GeometryEdgeRelationship[];
  wallJunctions: WallJunction[];
  productInstances: (ProductInstance & {
    sku: SkuWithCategory;
    designOption: FurnitureDesignOption | null;
    colourOption: FurnitureColourOption | null;
    sizeOption: FurnitureSizeOption | null;
  })[];
  productInstanceEdges: ProductInstanceEdge[];
  geometryProductRelationships: GeometryProductRelationship[];
  templateParameters: (TemplateParameter & { permission: ConsultantPermission | null })[];
  validationResults: DesignValidationResult[];
  masterBoms: (MasterBom & { lines: unknown[] })[];
  fixtures: Fixture[];
  constraints: Constraint[];
};

export type { Fixture, WallSegment, WallJunction, Constraint };

export type FullProject = Project & {
  template: Design & { templateParameters: (TemplateParameter & { permission: ConsultantPermission | null })[] };
  productInstances: (ProjectProductInstance & { sku: SkuWithCategory })[];
  productInstanceEdges: ProjectProductInstanceEdge[];
  geometryProductRelationships: ProjectGeometryProductRelationship[];
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

export type FixtureTypeValue = "TV" | "AC_UNIT" | "ELECTRICAL_SOCKET" | "WINDOW" | "DOOR";

export type ConstraintTargetKindValue = "FIXTURE" | "PRODUCT_INSTANCE" | "GEOMETRY_NODE" | "GEOMETRY_EDGE";
export type ConstraintTypeValue = "DISTANCE" | "ALIGN" | "EQUAL" | "MIN_MAX" | "CENTER" | "EDGE_TO_EDGE" | "FIXED_POSITION";
export type ConstraintAxisValue = "X" | "Y";
export type ConstraintTargetInput = { kind: ConstraintTargetKindValue; id: string };

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

  createWallSegment: (id: string, data: { lengthMm: number; heightMm: number }) =>
    request<{ segment: WallSegment; edges: GeometryEdge[] }>("PUT", `/designs/${id}/wall-segments/first`, data),

  addWallSegment: (id: string, data: { lengthMm: number; heightMm: number; angleDeg: number }) =>
    request<{ segment: WallSegment; edges: GeometryEdge[] }>("POST", `/designs/${id}/wall-segments/second`, data),

  updateWallSegment: (id: string, segmentId: string, data: { lengthMm?: number; heightMm?: number }) =>
    request<WallSegment>("PATCH", `/designs/${id}/wall-segments/${segmentId}`, data),

  deleteWallSegment: (id: string, segmentId: string) =>
    request<void>("DELETE", `/designs/${id}/wall-segments/${segmentId}`),

  updateWallJunction: (id: string, junctionId: string, data: { angleDeg: number }) =>
    request<WallJunction>("PATCH", `/designs/${id}/wall-junctions/${junctionId}`, data),

  listZones: (id: string) => request<Zone[]>("GET", `/designs/${id}/zones`),
  createZone: (
    id: string,
    data: {
      wallSegmentId: string;
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

  updateSku: (
    skuId: string,
    data: {
      code?: string;
      name?: string;
      categoryId?: string;
      defaultWidthMm?: number | null;
      defaultUnit?: string;
      minCutPieceMm?: number | null;
      attributes?: unknown;
      rotatable?: boolean;
    },
  ) => request<SkuMaster>("PATCH", `/skus/${skuId}`, data),

  discontinueSku: (skuId: string) => request<SkuMaster>("POST", `/skus/${skuId}/discontinue`),

  createProductInstance: (
    id: string,
    data: {
      skuId: string;
      geometryNodeId?: string;
      wallSegmentId?: string;
      x?: number;
      y?: number;
      z?: number;
      rotationDeg?: number;
      quantity?: number;
      designOptionId?: string;
      colourOptionId?: string;
      sizeOptionId?: string;
    },
  ) => request<ProductInstance>("POST", `/designs/${id}/product-instances`, data),

  updateProductInstance: (
    id: string,
    instanceId: string,
    data: {
      wallSegmentId?: string;
      x?: number;
      y?: number;
      z?: number;
      rotationDeg?: number;
      quantity?: number;
      designOptionId?: string;
      colourOptionId?: string;
      sizeOptionId?: string;
    },
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

  login: (email: string, password: string) => request<SafeUser>("POST", "/auth/login", { email, password }),
  logout: () => request<void>("POST", "/auth/logout", {}),
  getMe: () => request<SafeUser>("GET", "/auth/me"),

  listProjects: () => request<(Project & { template: Design })[]>("GET", "/projects"),
  createProject: (data: { name: string; templateId: string }) =>
    request<Project & { productInstances: ProjectProductInstance[] }>("POST", "/projects", data),
  getProject: (id: string) => request<FullProject>("GET", `/projects/${id}`),
  deleteProject: (id: string) => request<void>("DELETE", `/projects/${id}`),

  updateProjectProductInstance: (
    id: string,
    instanceId: string,
    data: {
      quantity?: number;
      rotationDeg?: number;
      x?: number;
      y?: number;
      z?: number;
      skuId?: string;
      designOptionId?: string | null;
      colourOptionId?: string | null;
      sizeOptionId?: string | null;
    },
  ) => request<ProjectProductInstance>("PATCH", `/projects/${id}/product-instances/${instanceId}`, data),

  setProjectEdgeTreatment: (id: string, edgeId: string, skuId: string) =>
    request<ProjectGeometryProductRelationship & { productInstance: ProjectProductInstance }>(
      "PATCH",
      `/projects/${id}/geometry-edges/${edgeId}/treatment`,
      { skuId },
    ),

  getFinalBom: (id: string) => request<FinalBom & { lines: FinalBomLine[] }>("GET", `/projects/${id}/final-bom`),
  generateFinalBom: (id: string) =>
    request<FinalBom & { lines: FinalBomLine[] }>("POST", `/projects/${id}/final-bom`, {}),

  listFixtures: (id: string) => request<Fixture[]>("GET", `/designs/${id}/fixtures`),
  createFixture: (
    id: string,
    data: {
      fixtureType: FixtureTypeValue;
      label?: string;
      wallSegmentId?: string;
      xMm: number;
      yMm: number;
      widthMm: number;
      heightMm: number;
      clearanceMm?: number;
    },
  ) => request<Fixture>("POST", `/designs/${id}/fixtures`, data),
  updateFixture: (
    id: string,
    fixtureId: string,
    data: Partial<{
      fixtureType: FixtureTypeValue;
      label: string | null;
      wallSegmentId: string | null;
      xMm: number;
      yMm: number;
      widthMm: number;
      heightMm: number;
      clearanceMm: number;
    }>,
  ) => request<Fixture>("PATCH", `/designs/${id}/fixtures/${fixtureId}`, data),
  deleteFixture: (id: string, fixtureId: string) =>
    request<void>("DELETE", `/designs/${id}/fixtures/${fixtureId}`),

  listConstraints: (id: string) => request<Constraint[]>("GET", `/designs/${id}/constraints`),
  createConstraint: (
    id: string,
    data: {
      constraintType: ConstraintTypeValue;
      targetA: ConstraintTargetInput;
      targetB?: ConstraintTargetInput | null;
      axis: ConstraintAxisValue;
      valueMm?: number;
      minValueMm?: number;
      maxValueMm?: number;
    },
  ) => request<Constraint>("POST", `/designs/${id}/constraints`, data),
  deleteConstraint: (id: string, constraintId: string) =>
    request<void>("DELETE", `/designs/${id}/constraints/${constraintId}`),

  listGeometryPrimitiveLines: (id: string) =>
    request<GeometryPrimitiveLine[]>("GET", `/designs/${id}/geometry-primitives/lines`),
  createGeometryPrimitiveLine: (
    id: string,
    data: { startXMm: number; startYMm: number; endXMm: number; endYMm: number; label?: string },
  ) => request<GeometryPrimitiveLine>("POST", `/designs/${id}/geometry-primitives/lines`, data),

  listGeometryPrimitiveRectangles: (id: string) =>
    request<GeometryPrimitiveRectangle[]>("GET", `/designs/${id}/geometry-primitives/rectangles`),
  createGeometryPrimitiveRectangle: (
    id: string,
    data: { xMm: number; yMm: number; widthMm: number; heightMm: number; rotationDeg?: number; label?: string },
  ) => request<GeometryPrimitiveRectangle>("POST", `/designs/${id}/geometry-primitives/rectangles`, data),

  listGeometryPrimitivePolylines: (id: string) =>
    request<(GeometryPrimitivePolyline & { points: GeometryPrimitivePolylinePoint[] })[]>(
      "GET",
      `/designs/${id}/geometry-primitives/polylines`,
    ),
  createGeometryPrimitivePolyline: (
    id: string,
    data: { points: { xMm: number; yMm: number; bulge?: number }[]; closed?: boolean; label?: string },
  ) =>
    request<GeometryPrimitivePolyline & { points: GeometryPrimitivePolylinePoint[] }>(
      "POST",
      `/designs/${id}/geometry-primitives/polylines`,
      data,
    ),

  listGeometryPrimitiveArcs: (id: string) =>
    request<GeometryPrimitiveArc[]>("GET", `/designs/${id}/geometry-primitives/arcs`),
  createGeometryPrimitiveArc: (
    id: string,
    data: {
      centerXMm: number;
      centerYMm: number;
      radiusMm: number;
      startAngleDeg: number;
      sweepAngleDeg: number;
      label?: string;
    },
  ) => request<GeometryPrimitiveArc>("POST", `/designs/${id}/geometry-primitives/arcs`, data),

  listGeometryPrimitiveCircles: (id: string) =>
    request<GeometryPrimitiveCircle[]>("GET", `/designs/${id}/geometry-primitives/circles`),
  createGeometryPrimitiveCircle: (
    id: string,
    data: { centerXMm: number; centerYMm: number; radiusMm: number; label?: string },
  ) => request<GeometryPrimitiveCircle>("POST", `/designs/${id}/geometry-primitives/circles`, data),
  // Deletion for every primitive kind reuses the existing generic
  // deleteGeometryNode route/client method above, unchanged.
};
