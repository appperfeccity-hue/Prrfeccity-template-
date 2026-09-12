import { prisma } from "@/lib/prisma";
import type { ValidationIssue } from "@/lib/types";
import { WIDTH_TOLERANCE_MM } from "@/lib/graph/constants";

const SPATIAL_ADJACENCY_TYPES = new Set(["ADJACENT_TO", "MEETS", "SHARES_BOUNDARY"]);

export async function validateDesign(designId: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const [
    segments,
    junctions,
    zones,
    partitions,
    panels,
    edges,
    edgeRelationships,
    productInstances,
    geometryProductRelationships,
    productInstanceEdges,
    templateParameters,
    fixtures,
  ] = await Promise.all([
    prisma.wallSegment.findMany({ where: { designId }, orderBy: { sequence: "asc" } }),
    prisma.wallJunction.findMany({ where: { designId } }),
    prisma.zone.findMany({ where: { designId } }),
    prisma.zonePartition.findMany({ where: { designId } }),
    prisma.panel.findMany({ where: { designId } }),
    prisma.geometryEdge.findMany({ where: { designId } }),
    prisma.geometryEdgeRelationship.findMany({ where: { designId } }),
    prisma.productInstance.findMany({
      where: { designId },
      include: { sku: { include: { category: true, sizeOptions: true } }, sizeOption: true },
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
    prisma.fixture.findMany({ where: { designId } }),
  ]);

  // Shared grouping used by rules 2 and 4 -- a wall segment's own ordered
  // zone sequence is the natural per-segment unit both rules reason about.
  const zonesBySegment = new Map<string, typeof zones>();
  for (const zone of zones) {
    if (!zone.wallSegmentId) continue;
    const list = zonesBySegment.get(zone.wallSegmentId) ?? [];
    list.push(zone);
    zonesBySegment.set(zone.wallSegmentId, list);
  }

  // 1. WALL_CONFIGURED
  if (segments.length === 0) {
    issues.push({ code: "WALL_CONFIGURED", severity: "ERROR", message: "Design has no wall segment configured" });
  } else {
    for (const segment of segments) {
      if (segment.lengthMm <= 0) {
        issues.push({
          code: "WALL_CONFIGURED",
          severity: "ERROR",
          message: `Wall segment ${segment.sequence + 1} length must be positive`,
          refType: "WallSegment",
          refId: segment.id,
        });
      }
    }
  }

  // 2. ZONE_COUNT (per segment -- a wall segment's zone sequence is the
  // natural per-wall unit, matching rule 4's own established grouping)
  for (const segment of segments) {
    const group = zonesBySegment.get(segment.id) ?? [];
    if (group.length < 1 || group.length > 3) {
      issues.push({
        code: "ZONE_COUNT",
        severity: "ERROR",
        message: `Wall segment ${segment.sequence + 1} must have between 1 and 3 zones (has ${group.length})`,
        refType: "WallSegment",
        refId: segment.id,
      });
    }
  }
  for (const zone of zones.filter((z) => z.wallSegmentId == null)) {
    issues.push({
      code: "ZONE_COUNT",
      severity: "ERROR",
      message: "Zone is not assigned to any wall segment",
      refType: "Zone",
      refId: zone.id,
    });
  }

  // 3. ZONE_ASSOCIATION
  for (const zone of zones) {
    if (zone.associatesWith === "WALL" && !zone.wallSegmentId) {
      issues.push({
        code: "ZONE_ASSOCIATION",
        severity: "ERROR",
        message: "Zone associated with WALL must reference a wallSegmentId",
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
  for (const segmentZones of zonesBySegment.values()) {
    const sorted = [...segmentZones].sort((a, b) => a.orderIndex - b.orderIndex);
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

  // 12b. FURNITURE_CONFIGURATION_COMPLETE -- "SKU + Design + Colour + Size ->
  // fixed configuration" is only authoritative once a Size is actually
  // selected. Only applies to a SKU that defines size options at all --
  // furniture with no catalogue sizes (or a non-furniture SKU) has nothing to
  // require here.
  for (const instance of productInstances) {
    if (instance.sku.category.key !== "FURNITURE") continue;
    if (instance.sku.sizeOptions.length === 0) continue;
    if (instance.sizeOptionId == null) {
      issues.push({
        code: "FURNITURE_CONFIGURATION_COMPLETE",
        severity: "ERROR",
        message: "Furniture instance has no Size selected from the catalogue",
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

  // 18. FIXTURE_CLEARANCE_OVERLAP -- a Fixture never enters the Master BOM
  // (structurally impossible, not filtered here -- see bom.ts's three
  // provenance sources), but its clearance zone is a real installation
  // constraint. Scoped to FURNITURE-category instances with a resolved
  // sizeOptionId only -- non-furniture instances are typically
  // geometry-attached (meaningless freestanding x/y) or have no 2D
  // footprint field at all; a furniture instance missing a sizeOptionId is
  // already independently flagged by rule 12b (FURNITURE_CONFIGURATION_COMPLETE).
  // Grouped by wallSegmentId first -- a Fixture on one segment and a
  // furniture instance on another share no physical plane, so comparing
  // their raw mm coordinates directly would be a false positive/negative
  // once 2 segments exist. Rows with no segment assigned bucket into
  // "unscoped" together, preserving today's single-segment behavior exactly.
  const bySegment = <T extends { wallSegmentId: string | null }>(rows: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = row.wallSegmentId ?? "unscoped";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  };
  const fixturesBySegment = bySegment(fixtures);
  const instancesBySegment = bySegment(productInstances);
  for (const [segmentKey, segmentFixtures] of fixturesBySegment) {
    const candidateInstances = instancesBySegment.get(segmentKey) ?? [];
    for (const fx of segmentFixtures) {
      const fixtureBox = {
        minX: fx.xMm - fx.clearanceMm,
        maxX: fx.xMm + fx.widthMm + fx.clearanceMm,
        minY: fx.yMm - fx.clearanceMm,
        maxY: fx.yMm + fx.heightMm + fx.clearanceMm,
      };
      for (const instance of candidateInstances) {
        if (instance.sku.category.key !== "FURNITURE") continue;
        if (instance.x == null || instance.y == null) continue;
        if (!instance.sizeOption) continue;
        const half = { w: instance.sizeOption.widthMm / 2, h: instance.sizeOption.heightMm / 2 };
        const instanceBox = {
          minX: instance.x - half.w,
          maxX: instance.x + half.w,
          minY: instance.y - half.h,
          maxY: instance.y + half.h,
        };
        const overlaps =
          fixtureBox.minX + WIDTH_TOLERANCE_MM < instanceBox.maxX &&
          fixtureBox.maxX - WIDTH_TOLERANCE_MM > instanceBox.minX &&
          fixtureBox.minY + WIDTH_TOLERANCE_MM < instanceBox.maxY &&
          fixtureBox.maxY - WIDTH_TOLERANCE_MM > instanceBox.minY;
        if (overlaps) {
          issues.push({
            code: "FIXTURE_CLEARANCE_OVERLAP",
            severity: "ERROR",
            message: `Furniture placement overlaps the clearance zone of fixture "${fx.label ?? fx.fixtureType}"`,
            refType: "ProductInstance",
            refId: instance.id,
          });
        }
      }
    }
  }

  // 19. WALL_JUNCTION_VALID -- these states shouldn't be reachable via the
  // API (addWallSegment always creates segment+junction together;
  // deleteWallSegment guards against a dangling junction), but this is
  // defense-in-depth against direct DB tampering, the same posture as the
  // old L_TYPE cornerAngleDeg check this rule replaces.
  if (junctions.length > 1) {
    issues.push({ code: "WALL_JUNCTION_VALID", severity: "ERROR", message: "A design may have at most 1 wall junction" });
  }
  if (segments.length === 2 && junctions.length === 0) {
    issues.push({ code: "WALL_JUNCTION_VALID", severity: "ERROR", message: "Two wall segments require a connecting junction" });
  }
  if (segments.length < 2 && junctions.length > 0) {
    issues.push({ code: "WALL_JUNCTION_VALID", severity: "ERROR", message: "A wall junction exists without two wall segments to connect" });
  }
  for (const junction of junctions) {
    if (junction.angleDeg <= 0 || junction.angleDeg >= 360) {
      issues.push({
        code: "WALL_JUNCTION_VALID",
        severity: "ERROR",
        message: "Wall junction angle must be between 0 and 360 degrees, exclusive",
        refType: "WallJunction",
        refId: junction.id,
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
