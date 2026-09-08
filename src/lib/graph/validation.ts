import { prisma } from "@/lib/prisma";
import type { ValidationIssue } from "@/lib/types";
import { WIDTH_TOLERANCE_MM } from "@/lib/graph/constants";

const SPATIAL_ADJACENCY_TYPES = new Set(["ADJACENT_TO", "MEETS", "SHARES_BOUNDARY"]);

export async function validateDesign(designId: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const [
    wall,
    zones,
    partitions,
    panels,
    edges,
    edgeRelationships,
    productInstances,
    geometryProductRelationships,
    productInstanceEdges,
    templateParameters,
  ] = await Promise.all([
    prisma.wall.findFirst({ where: { designId } }),
    prisma.zone.findMany({ where: { designId } }),
    prisma.zonePartition.findMany({ where: { designId } }),
    prisma.panel.findMany({ where: { designId } }),
    prisma.geometryEdge.findMany({ where: { designId } }),
    prisma.geometryEdgeRelationship.findMany({ where: { designId } }),
    prisma.productInstance.findMany({
      where: { designId },
      include: { sku: { include: { category: true } } },
    }),
    prisma.geometryProductRelationship.findMany({
      where: { designId },
      include: { productInstance: { include: { sku: { include: { category: true } } } } },
    }),
    prisma.productInstanceEdge.findMany({
      where: { designId },
      include: {
        fromInstance: { include: { sku: { include: { category: true } } } },
        toInstance: { include: { sku: { include: { category: true } } } },
        sourceSkuEdge: true,
      },
    }),
    prisma.templateParameter.findMany({ where: { templateId: designId }, include: { permission: true } }),
  ]);

  // 1. WALL_CONFIGURED
  if (!wall) {
    issues.push({ code: "WALL_CONFIGURED", severity: "ERROR", message: "Design has no wall configured" });
  } else {
    if (wall.lengthMm <= 0) {
      issues.push({
        code: "WALL_CONFIGURED",
        severity: "ERROR",
        message: "Wall length must be positive",
        refType: "Wall",
        refId: wall.id,
      });
    }
    if (wall.wallType === "L_TYPE" && wall.cornerAngleDeg == null) {
      issues.push({
        code: "WALL_CONFIGURED",
        severity: "ERROR",
        message: "L-Type wall must have a corner angle",
        refType: "Wall",
        refId: wall.id,
      });
    }
  }

  // 2. ZONE_COUNT
  if (zones.length < 1 || zones.length > 3) {
    issues.push({
      code: "ZONE_COUNT",
      severity: "ERROR",
      message: `Design must have between 1 and 3 zones (has ${zones.length})`,
    });
  }

  // 3. ZONE_ASSOCIATION
  for (const zone of zones) {
    if (zone.associatesWith === "WALL" && !zone.wallId) {
      issues.push({
        code: "ZONE_ASSOCIATION",
        severity: "ERROR",
        message: "Zone associated with WALL must reference a wallId",
        refType: "Zone",
        refId: zone.id,
      });
    }
  }

  // 4. ZONE_ADJACENCY_INTEGRITY
  const edgesByNodeId = new Map<string, typeof edges>();
  for (const edge of edges) {
    const list = edgesByNodeId.get(edge.nodeId) ?? [];
    list.push(edge);
    edgesByNodeId.set(edge.nodeId, list);
  }
  const adjacentEdgeIdPairs = new Set<string>();
  for (const rel of edgeRelationships) {
    if (!SPATIAL_ADJACENCY_TYPES.has(rel.relationshipType)) continue;
    adjacentEdgeIdPairs.add(`${rel.edgeAId}:${rel.edgeBId}`);
    adjacentEdgeIdPairs.add(`${rel.edgeBId}:${rel.edgeAId}`);
  }
  const zonesByWall = new Map<string, typeof zones>();
  for (const zone of zones) {
    if (!zone.wallId) continue;
    const list = zonesByWall.get(zone.wallId) ?? [];
    list.push(zone);
    zonesByWall.set(zone.wallId, list);
  }
  for (const wallZones of zonesByWall.values()) {
    const sorted = [...wallZones].sort((a, b) => a.orderIndex - b.orderIndex);
    for (let i = 0; i < sorted.length - 1; i++) {
      const zoneA = sorted[i];
      const zoneB = sorted[i + 1];
      const edgesA = edgesByNodeId.get(zoneA.id) ?? [];
      const edgesB = edgesByNodeId.get(zoneB.id) ?? [];
      const hasAdjacency = edgesA.some((ea) =>
        edgesB.some((eb) => adjacentEdgeIdPairs.has(`${ea.id}:${eb.id}`)),
      );
      if (!hasAdjacency) {
        issues.push({
          code: "ZONE_ADJACENCY_INTEGRITY",
          severity: "ERROR",
          message: `Adjacent zones ${zoneA.id} and ${zoneB.id} have no GeometryEdgeRelationship connecting them`,
          refType: "Zone",
          refId: zoneB.id,
        });
      }
    }
  }

  // 5. PARTITION_COVERAGE
  const partitionsByZone = new Map<string, typeof partitions>();
  for (const p of partitions) {
    const list = partitionsByZone.get(p.zoneId) ?? [];
    list.push(p);
    partitionsByZone.set(p.zoneId, list);
  }
  for (const zone of zones) {
    const zonePartitions = partitionsByZone.get(zone.id) ?? [];
    if (zonePartitions.length === 0) {
      issues.push({
        code: "PARTITION_COVERAGE",
        severity: "ERROR",
        message: "Zone has no partitions",
        refType: "Zone",
        refId: zone.id,
      });
      continue;
    }
    const totalWidth = zonePartitions.reduce((sum, p) => sum + p.widthMm, 0);
    if (Math.abs(totalWidth - zone.widthMm) > WIDTH_TOLERANCE_MM) {
      issues.push({
        code: "PARTITION_COVERAGE",
        severity: "ERROR",
        message: `Partition widths (${totalWidth}mm) do not cover zone width (${zone.widthMm}mm)`,
        refType: "Zone",
        refId: zone.id,
      });
    }
  }

  // 6. PANEL_COVERAGE
  const panelsByPartition = new Map<string, typeof panels>();
  for (const panel of panels) {
    const list = panelsByPartition.get(panel.partitionId) ?? [];
    list.push(panel);
    panelsByPartition.set(panel.partitionId, list);
  }
  for (const partition of partitions) {
    const partitionPanels = panelsByPartition.get(partition.id) ?? [];
    if (partitionPanels.length === 0) {
      issues.push({
        code: "PANEL_COVERAGE",
        severity: "ERROR",
        message: "Partition has no panels",
        refType: "ZonePartition",
        refId: partition.id,
      });
      continue;
    }
    const totalWidth = partitionPanels.reduce((sum, p) => sum + p.widthMm, 0);
    if (Math.abs(totalWidth - partition.widthMm) > WIDTH_TOLERANCE_MM) {
      issues.push({
        code: "PANEL_COVERAGE",
        severity: "ERROR",
        message: `Panel widths (${totalWidth}mm) do not cover partition width (${partition.widthMm}mm)`,
        refType: "ZonePartition",
        refId: partition.id,
      });
    }
  }

  // 7-10: edge-treatment flags
  const relationshipsByEdgeId = new Map<string, typeof geometryProductRelationships>();
  const relationshipsByNodeId = new Map<string, typeof geometryProductRelationships>();
  for (const rel of geometryProductRelationships) {
    if (rel.geometryEdgeId) {
      const list = relationshipsByEdgeId.get(rel.geometryEdgeId) ?? [];
      list.push(rel);
      relationshipsByEdgeId.set(rel.geometryEdgeId, list);
    }
    if (rel.geometryNodeId) {
      const list = relationshipsByNodeId.get(rel.geometryNodeId) ?? [];
      list.push(rel);
      relationshipsByNodeId.set(rel.geometryNodeId, list);
    }
  }

  for (const edge of edges) {
    const rels = relationshipsByEdgeId.get(edge.id) ?? [];

    if (edge.requiresTrim) {
      const satisfied = rels.some((r) => r.productInstance.sku.category.key === "CONNECTION");
      if (!satisfied) {
        issues.push({
          code: "EDGE_TREATMENT_TRIM",
          severity: "ERROR",
          message: "Edge requires trim but has no linked CONNECTION-category product",
          refType: "GeometryEdge",
          refId: edge.id,
        });
      }
    }

    if (edge.requiresConnector) {
      const satisfied = rels.some((r) => r.productInstance.sku.category.key === "CONNECTION");
      if (!satisfied) {
        issues.push({
          code: "EDGE_TREATMENT_CONNECTOR",
          severity: "ERROR",
          message: "Edge requires connector but has no linked CONNECTION-category product",
          refType: "GeometryEdge",
          refId: edge.id,
        });
      }
    }

    if (edge.requiresTermination) {
      const satisfied = rels.some((r) => r.relationshipType === "TERMINATES");
      if (!satisfied) {
        issues.push({
          code: "EDGE_TERMINATION",
          severity: "ERROR",
          message: "Edge requires termination but has no TERMINATES relationship",
          refType: "GeometryEdge",
          refId: edge.id,
        });
      }
    }

    if (edge.isLightingBoundary) {
      const satisfied = rels.some(
        (r) => r.productInstance.sku.category.key === "FUNCTIONAL" && r.productInstance.z != null,
      );
      if (!satisfied) {
        issues.push({
          code: "LIGHTING_BOUNDARY_RELATIONSHIP",
          severity: "ERROR",
          message: "Lighting boundary edge has no linked FUNCTIONAL product with a Z position",
          refType: "GeometryEdge",
          refId: edge.id,
        });
      }
    }
  }

  // 11. STRUCTURAL_SUPPORT (offcuts are leftover material, not installed panels -- skipped)
  for (const panel of panels) {
    if (panel.isOffcut) continue;
    const rels = relationshipsByNodeId.get(panel.id) ?? [];
    const satisfied = rels.some((r) => r.productInstance.sku.category.key === "STRUCTURAL");
    if (!satisfied) {
      issues.push({
        code: "STRUCTURAL_SUPPORT",
        severity: "ERROR",
        message: "Panel has no linked STRUCTURAL product",
        refType: "Panel",
        refId: panel.id,
      });
    }
  }

  // 12. FURNITURE_COORDINATES
  for (const instance of productInstances) {
    if (instance.sku.category.key !== "FURNITURE") continue;
    if (instance.x == null || instance.y == null) {
      issues.push({
        code: "FURNITURE_COORDINATES",
        severity: "ERROR",
        message: "Furniture instance is missing x/y coordinates",
        refType: "ProductInstance",
        refId: instance.id,
      });
    }
  }

  // 13. PRODUCT_EDGE_CONSISTENCY
  for (const edge of productInstanceEdges) {
    if (!edge.sourceSkuEdge) continue;
    const matchesForward =
      edge.fromInstance.skuId === edge.sourceSkuEdge.fromSkuId &&
      edge.toInstance.skuId === edge.sourceSkuEdge.toSkuId;
    const matchesReverse =
      edge.fromInstance.skuId === edge.sourceSkuEdge.toSkuId &&
      edge.toInstance.skuId === edge.sourceSkuEdge.fromSkuId;
    if (!matchesForward && !matchesReverse) {
      issues.push({
        code: "PRODUCT_EDGE_CONSISTENCY",
        severity: "ERROR",
        message: "ProductInstanceEdge's sourceSkuEdge does not match the instances' actual SKUs",
        refType: "ProductInstanceEdge",
        refId: edge.id,
      });
    }
  }

  // 14. REQUIRED_SKU_EDGES_SATISFIED
  const distinctSkuIds = [...new Set(productInstances.map((i) => i.skuId))];
  const requiresEdges = distinctSkuIds.length
    ? await prisma.skuEdge.findMany({
        where: { fromSkuId: { in: distinctSkuIds }, edgeType: "REQUIRES" },
      })
    : [];
  const requiresBySkuId = new Map<string, typeof requiresEdges>();
  for (const se of requiresEdges) {
    const list = requiresBySkuId.get(se.fromSkuId) ?? [];
    list.push(se);
    requiresBySkuId.set(se.fromSkuId, list);
  }
  const outgoingEdgesByInstance = new Map<string, typeof productInstanceEdges>();
  for (const edge of productInstanceEdges) {
    const list = outgoingEdgesByInstance.get(edge.fromInstanceId) ?? [];
    list.push(edge);
    outgoingEdgesByInstance.set(edge.fromInstanceId, list);
  }
  for (const instance of productInstances) {
    const required = requiresBySkuId.get(instance.skuId) ?? [];
    const outgoing = outgoingEdgesByInstance.get(instance.id) ?? [];
    for (const req of required) {
      const satisfied = outgoing.some(
        (e) => e.edgeType === "REQUIRES" && e.toInstance.skuId === req.toSkuId,
      );
      if (!satisfied) {
        issues.push({
          code: "REQUIRED_SKU_EDGES_SATISFIED",
          severity: "ERROR",
          message: `Instance of SKU requires a linked instance of SKU ${req.toSkuId}, but none is placed`,
          refType: "ProductInstance",
          refId: instance.id,
        });
      }
    }
  }

  // 15. QUANTITY_NONNEGATIVE
  for (const instance of productInstances) {
    if (instance.quantity <= 0) {
      issues.push({
        code: "QUANTITY_NONNEGATIVE",
        severity: "ERROR",
        message: "Product instance quantity must be greater than zero",
        refType: "ProductInstance",
        refId: instance.id,
      });
    }
  }

  // 16. PARAMETER_PERMISSION_RANGE_SANITY
  for (const param of templateParameters) {
    if (!param.permission) continue;
    const { minValue, maxValue } = param.permission;
    if (minValue == null || maxValue == null) continue;
    const defaultNum = Number(param.defaultValue);
    if (Number.isNaN(defaultNum) || defaultNum < minValue || defaultNum > maxValue) {
      issues.push({
        code: "PARAMETER_PERMISSION_RANGE_SANITY",
        severity: "ERROR",
        message: "Parameter default value falls outside its permitted min/max range",
        refType: "TemplateParameter",
        refId: param.id,
      });
    }
  }

  // 17. PANEL_OFFCUT_WASTE -- an unusable offcut is informational, never blocks publish
  for (const panel of panels) {
    if (panel.isOffcut && panel.offcutReusable === false) {
      issues.push({
        code: "PANEL_OFFCUT_WASTE",
        severity: "WARNING",
        message: "Offcut is below the SKU's minimum cut piece and is not reusable",
        refType: "Panel",
        refId: panel.id,
      });
    }
  }

  return issues;
}

export async function runAndPersistValidation(designId: string) {
  const issues = await validateDesign(designId);
  const passed = !issues.some((i) => i.severity === "ERROR");
  const result = await prisma.designValidationResult.create({
    data: { designId, passed, issues },
  });
  return { result, issues, passed };
}
