export const WIDTH_TOLERANCE_MM = 1;

export const CORNER_ANGLE_TOLERANCE_DEG = 0.01;

// Disambiguates which of ProductInstance's three option groups an
// ENUM_SELECTION TemplateParameter targets -- targetProductInstanceId alone
// is ambiguous across designOptionId/colourOptionId/sizeOptionId. Matched
// against TemplateParameter.paramKey by src/lib/graph/project.ts.
export const ENUM_SELECTION_PARAM_KEYS = {
  DESIGN_OPTION: "DESIGN_OPTION",
  COLOUR_OPTION: "COLOUR_OPTION",
  SIZE_OPTION: "SIZE_OPTION",
} as const;
