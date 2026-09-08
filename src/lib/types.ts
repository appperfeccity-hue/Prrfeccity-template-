import { z } from "zod";

export const createDesignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const setWallSchema = z.object({
  wallType: z.enum(["STRAIGHT_LTR", "STRAIGHT_RTL", "L_TYPE"]),
  lengthMm: z.number().positive(),
  heightMm: z.number().positive(),
  cornerAngleDeg: z.number().optional(),
});

export const createZoneSchema = z.object({
  wallId: z.string().optional(),
  associatesWith: z.enum(["WALL", "STRUCTURE"]),
  orderIndex: z.number().int().nonnegative(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  hasCoveLighting: z.boolean().optional(),
  coveLightZMm: z.number().optional(),
});

export const updateZoneSchema = createZoneSchema.partial();

export const createGeometryEdgeRelationshipSchema = z.object({
  edgeAId: z.string(),
  edgeBId: z.string(),
  relationshipType: z.literal("ADJACENCY"),
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
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  rotationDeg: z.number().optional(),
  quantity: z.number().positive().optional(),
});

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
  })
  .refine((v) => Boolean(v.geometryEdgeId) !== Boolean(v.geometryNodeId), {
    message: "Exactly one of geometryEdgeId or geometryNodeId must be set",
  });

export const createProductInstanceEdgeSchema = z.object({
  fromInstanceId: z.string(),
  toInstanceId: z.string(),
  edgeType: z.enum(["REQUIRES", "CONNECTS", "TERMINATES", "SUPPORTS", "INTERACTS"]),
  sourceSkuEdgeId: z.string().optional(),
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

export const updateEdgeFlagsSchema = z.object({
  requiresTermination: z.boolean().optional(),
  requiresConnector: z.boolean().optional(),
  requiresTrim: z.boolean().optional(),
  isLightingBoundary: z.boolean().optional(),
});

export type ValidationIssueSeverity = "ERROR" | "WARNING";

export type ValidationIssue = {
  code: string;
  severity: ValidationIssueSeverity;
  message: string;
  refType?: string;
  refId?: string;
};
