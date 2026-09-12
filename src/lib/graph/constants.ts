export const WIDTH_TOLERANCE_MM = 1;

// Application-layer cap only -- never a DB constraint -- so a future
// N-segment pass only needs to raise this constant, never a second
// migration for the WallSegment/WallJunction shape.
export const MAX_WALL_SEGMENTS_PER_DESIGN = 2;

// Disambiguates which of ProductInstance's three option groups an
// ENUM_SELECTION TemplateParameter targets -- targetProductInstanceId alone
// is ambiguous across designOptionId/colourOptionId/sizeOptionId. Matched
// against TemplateParameter.paramKey by src/lib/graph/project.ts.
export const ENUM_SELECTION_PARAM_KEYS = {
  DESIGN_OPTION: "DESIGN_OPTION",
  COLOUR_OPTION: "COLOUR_OPTION",
  SIZE_OPTION: "SIZE_OPTION",
} as const;
