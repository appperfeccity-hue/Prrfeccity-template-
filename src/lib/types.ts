import { z } from "zod";

export const createDesignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const roleValues = ["ADMIN", "DESIGNER", "CONSULTANT", "SYSTEM"] as const;

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(roleValues),
});

export const createWallSegmentSchema = z.object({
  lengthMm: z.number().positive(),
  heightMm: z.number().positive(),
});

export const addWallSegmentSchema = createWallSegmentSchema.extend({
  angleDeg: z.number().gt(0).lt(360),
});

export const updateWallSegmentSchema = createWallSegmentSchema.partial();

export const updateWallJunctionSchema = z.object({
  angleDeg: z.number().gt(0).lt(360),
});

export const createZoneSchema = z.object({
  wallSegmentId: z.string(),
  associatesWith: z.enum(["WALL", "STRUCTURE"]),
  orderIndex: z.number().int().nonnegative(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  hasCoveLighting: z.boolean().optional(),
  coveLightZMm: z.number().optional(),
});

export const updateZoneSchema = createZoneSchema.partial();

export const geometryEdgeRelationshipTypes = [
  "ADJACENT_TO",
  "MEETS",
  "CONTINUES_TO",
  "SHARES_BOUNDARY",
  "TERMINATES_AT",
] as const;

export const createGeometryEdgeRelationshipSchema = z.object({
  edgeAId: z.string(),
  edgeBId: z.string(),
  relationshipType: z.enum(geometryEdgeRelationshipTypes),
});

export const createPartitionSchema = z.object({
  orderIndex: z.number().int().nonnegative(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
});

export const createPanelSchema = z.object({
  orderIndex: z.number().int().nonnegative(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  orientation: z.enum(["VERTICAL", "HORIZONTAL"]),
});

export const createProductInstanceSchema = z.object({
  skuId: z.string(),
  geometryNodeId: z.string().optional(),
  wallSegmentId: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  rotationDeg: z.number().optional(),
  quantity: z.number().positive().optional(),
  // Furniture Catalogue selection -- see FurnitureDesignOption/FurnitureColourOption/
  // FurnitureSizeOption in prisma/schema.prisma. Optional because non-furniture SKUs,
  // and furniture SKUs with no options in a given group, have nothing to select.
  designOptionId: z.string().optional(),
  colourOptionId: z.string().optional(),
  sizeOptionId: z.string().optional(),
});

export const skuEdgeTypes = [
  "REQUIRES",
  "CONNECTS_TO",
  "TERMINATES_WITH",
  "SUPPORTS",
  "COMPATIBLE_WITH",
  "INTERACTS_WITH",
  "INSTALLED_WITH",
] as const;

export const relationshipOrigins = ["DESIGNER_DEFINED", "CATALOG_DERIVED"] as const;

export const quantityRuleSchema = z
  .union([
    z.object({ type: z.literal("FIXED"), value: z.number().positive() }),
    z.object({ type: z.literal("PER_LENGTH_MM"), perMm: z.number().positive() }),
  ])
  .nullable()
  .optional();

export const createGeometryProductRelationshipSchema = z
  .object({
    geometryEdgeId: z.string().optional(),
    geometryNodeId: z.string().optional(),
    productInstanceId: z.string(),
    relationshipType: z.enum([
      "HAS_TREATMENT",
      "SUPPORTS",
      "TERMINATES",
      "BOUNDARY_OF",
      "POSITIONED_AT",
      "ADJACENT_TO",
    ]),
    condition: z.any().optional(),
    quantityRule: quantityRuleSchema,
    origin: z.enum(relationshipOrigins).optional(),
  })
  .refine((v) => Boolean(v.geometryEdgeId) !== Boolean(v.geometryNodeId), {
    message: "Exactly one of geometryEdgeId or geometryNodeId must be set",
  });

export const createProductInstanceEdgeSchema = z.object({
  fromInstanceId: z.string(),
  toInstanceId: z.string(),
  edgeType: z.enum(skuEdgeTypes),
  sourceSkuEdgeId: z.string().optional(),
  origin: z.enum(relationshipOrigins).optional(),
});

export const createTemplateParameterSchema = z.object({
  targetProductInstanceId: z.string().optional(),
  targetGeometryEdgeId: z.string().optional(),
  paramKey: z.string().min(1),
  paramType: z.enum([
    "NUMERIC_RANGE",
    "ENUM_SELECTION",
    "POSITION",
    "SKU_SUBSTITUTION",
    "EDGE_TREATMENT",
    "QUANTITY",
  ]),
  label: z.string().min(1),
  defaultValue: z.string(),
  unit: z.string().optional(),
});

export const setConsultantPermissionSchema = z.object({
  editableByConsultant: z.boolean(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  allowedValues: z.array(z.string()).optional(),
});

export const autoFillPartitionSchema = z.object({
  skuId: z.string(),
});

export const updateProductInstanceSchema = z.object({
  wallSegmentId: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  rotationDeg: z.number().optional(),
  quantity: z.number().positive().optional(),
  designOptionId: z.string().optional(),
  colourOptionId: z.string().optional(),
  sizeOptionId: z.string().optional(),
});

export const updatePanelSchema = z.object({
  widthMm: z.number().positive().optional(),
  orientation: z.enum(["VERTICAL", "HORIZONTAL"]).optional(),
});

// code/name are cosmetic (never bump SkuMaster.currentVersion); every other
// field here is physical/rule-affecting and bumps it -- see
// src/lib/graph/sku.ts's VERSION_BUMPING_FIELDS.
export const updateSkuMasterSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  categoryId: z.string().optional(),
  defaultWidthMm: z.number().positive().nullable().optional(),
  defaultUnit: z.string().min(1).optional(),
  minCutPieceMm: z.number().positive().nullable().optional(),
  attributes: z.unknown().nullable().optional(),
  rotatable: z.boolean().optional(),
});

// Design Library presentation metadata -- not part of the design graph, so
// editable even on a PUBLISHED design (see requireDesign vs requireDraftDesign).
export const updateDesignSchema = z.object({
  libraryRoomType: z.enum(["LIVING_ROOM", "TV_UNIT", "BEDROOM"]).nullable().optional(),
  lookId: z.string().nullable().optional(),
  pricePerSqFt: z.number().positive().nullable().optional(),
  areaSqFt: z.number().positive().nullable().optional(),
  isFavorited: z.boolean().optional(),
});

export const updateEdgeFlagsSchema = z.object({
  requiresTermination: z.boolean().optional(),
  requiresConnector: z.boolean().optional(),
  requiresTrim: z.boolean().optional(),
  isLightingBoundary: z.boolean().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1),
  templateId: z.string(),
});

export const updateProjectProductInstanceSchema = z.object({
  quantity: z.number().positive().optional(),
  rotationDeg: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  skuId: z.string().optional(),
  designOptionId: z.string().nullable().optional(),
  colourOptionId: z.string().nullable().optional(),
  sizeOptionId: z.string().nullable().optional(),
});

export const setProjectEdgeTreatmentSchema = z.object({
  skuId: z.string(),
});

export const fixtureTypes = ["TV", "AC_UNIT", "ELECTRICAL_SOCKET", "WINDOW", "DOOR"] as const;

export const createFixtureSchema = z.object({
  fixtureType: z.enum(fixtureTypes),
  label: z.string().min(1).optional(),
  wallSegmentId: z.string().optional(),
  xMm: z.number(),
  yMm: z.number(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  clearanceMm: z.number().nonnegative().optional(),
});

export const updateFixtureSchema = createFixtureSchema.partial();

export const constraintTargetKinds = ["FIXTURE", "PRODUCT_INSTANCE", "GEOMETRY_NODE", "GEOMETRY_EDGE"] as const;
export const constraintTypes = ["DISTANCE", "ALIGN", "EQUAL", "MIN_MAX", "CENTER", "EDGE_TO_EDGE", "FIXED_POSITION"] as const;
export const constraintAxes = ["X", "Y"] as const;

const constraintTargetSchema = z.object({ kind: z.enum(constraintTargetKinds), id: z.string() });

export const createConstraintSchema = z
  .object({
    constraintType: z.enum(constraintTypes),
    targetA: constraintTargetSchema,
    targetB: constraintTargetSchema.nullable().optional(),
    axis: z.enum(constraintAxes),
    valueMm: z.number().optional(),
    minValueMm: z.number().optional(),
    maxValueMm: z.number().optional(),
  })
  .refine((v) => (v.constraintType === "FIXED_POSITION") === (v.targetB == null), {
    message: "targetB is required for every ConstraintType except FIXED_POSITION",
  });

// Phase 6 item 1: Generalized Geometry System -- LINE is the one primitive
// kind with a full domain-function/API/rendering build-out this pass.
// RECTANGLE/POLYLINE/ARC/CIRCLE stay schema-only, no zod schema yet.
export const createGeometryPrimitiveLineSchema = z.object({
  startXMm: z.number(),
  startYMm: z.number(),
  endXMm: z.number(),
  endYMm: z.number(),
  label: z.string().optional(),
});

export type ValidationIssueSeverity = "ERROR" | "WARNING";

export type ValidationIssue = {
  code: string;
  severity: ValidationIssueSeverity;
  message: string;
  refType?: string;
  refId?: string;
};
