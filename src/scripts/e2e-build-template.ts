/**
 * Scripted, non-UI proof that a Template can be built end-to-end through the
 * REST API and that the generated Master BOM carries correct provenance.
 * See /root/.claude/plans/designer-canvas-published-imperative-bird.md §9.
 *
 * Requires the dev server running at BASE_URL (default http://localhost:3000).
 */
import "dotenv/config";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

let assertions = 0;
function assert(condition: boolean, message: string) {
  assertions++;
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ok: ${message}`);
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, json };
}

async function skuId(code: string): Promise<string> {
  const { json } = await api("GET", "/api/skus");
  const sku = json.find((s: { code: string }) => s.code === code);
  if (!sku) throw new Error(`Seed SKU ${code} not found -- did you run \`npm run db:seed\`?`);
  return sku.id;
}

async function skuEdgeId(fromCode: string, toCode: string): Promise<string> {
  const fromId = await skuId(fromCode);
  const toId = await skuId(toCode);
  const { json } = await api("GET", `/api/skus/${fromId}`);
  const edge = json.edgesFrom.find((e: { toSkuId: string }) => e.toSkuId === toId);
  if (!edge) throw new Error(`SkuEdge ${fromCode}->${toCode} not found in seed data`);
  return edge.id;
}

async function main() {
  console.log(`Running e2e build-template script against ${BASE_URL}\n`);

  // 1. Design + wall
  console.log("1. Create design, set wall (STRAIGHT_LTR, 3000x2400mm)");
  const { json: design } = await api("POST", "/api/designs", { name: "E2E Template" });
  const designId: string = design.id;

  const { json: wallResult } = await api("PUT", `/api/designs/${designId}/wall`, {
    wallType: "STRAIGHT_LTR",
    lengthMm: 3000,
    heightMm: 2400,
  });
  assert(wallResult.edges.length === 4, "wall has 4 edges (no CORNER for STRAIGHT_LTR)");
  assert(
    !wallResult.edges.some((e: { edgeRole: string }) => e.edgeRole === "CORNER"),
    "no CORNER edge on a straight wall",
  );
  const wallId: string = wallResult.wall.id;

  // 2. Zones + adjacency
  console.log("\n2. Create 2 zones (assert 4th rejected) + adjacency edge");
  const { json: zone1 } = await api("POST", `/api/designs/${designId}/zones`, {
    wallId,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 1500,
    heightMm: 2400,
  });
  const { json: zone2 } = await api("POST", `/api/designs/${designId}/zones`, {
    wallId,
    associatesWith: "WALL",
    orderIndex: 1,
    widthMm: 1500,
    heightMm: 2400,
  });
  const zone1Outer = zone1.edges.find((e: { edgeRole: string }) => e.edgeRole === "OUTER_BOUNDARY").id;
  const zone2Outer = zone2.edges.find((e: { edgeRole: string }) => e.edgeRole === "OUTER_BOUNDARY").id;

  await api("POST", `/api/designs/${designId}/geometry-edge-relationships`, {
    edgeAId: zone1Outer,
    edgeBId: zone2Outer,
    relationshipType: "ADJACENCY",
  });

  console.log("  (max-zone-limit check on a throwaway design, so it doesn't pollute the main one)");
  const { json: limitDesign } = await api("POST", "/api/designs", { name: "E2E Zone Limit Check" });
  for (let i = 0; i < 3; i++) {
    const { status } = await api("POST", `/api/designs/${limitDesign.id}/zones`, {
      associatesWith: "STRUCTURE",
      orderIndex: i,
      widthMm: 500,
      heightMm: 2400,
    });
    assert(status === 201, `zone ${i + 1}/3 accepted (at the 3-zone max)`);
  }
  const { status: fourthZoneStatus } = await api("POST", `/api/designs/${limitDesign.id}/zones`, {
    associatesWith: "STRUCTURE",
    orderIndex: 3,
    widthMm: 500,
    heightMm: 2400,
  });
  assert(fourthZoneStatus === 400, "4th zone rejected (exceeds 3-zone max)");

  // 3. Partitions + panels
  console.log("\n3. Create partition + panel on each zone, flag zone 1's panel edges");
  const { json: partition } = await api(
    "POST",
    `/api/designs/${designId}/zones/${zone1.zone.id}/partitions`,
    { orderIndex: 0, widthMm: 1500, heightMm: 2400 },
  );
  const { json: panelResult } = await api(
    "POST",
    `/api/designs/${designId}/partitions/${partition.id}/panels`,
    { orderIndex: 0, widthMm: 1500, heightMm: 2400, orientation: "VERTICAL" },
  );
  const panel = panelResult.panel;
  const [edgeStart, edgeEnd] = panelResult.edges;

  await api("PUT", `/api/designs/${designId}/geometry-edges/${edgeStart.id}`, {
    requiresTrim: true,
    requiresConnector: true,
    requiresTermination: true,
  });
  await api("PUT", `/api/designs/${designId}/geometry-edges/${edgeEnd.id}`, {
    isLightingBoundary: true,
  });

  // Zone 2 needs its own partition + panel to satisfy PARTITION_COVERAGE / PANEL_COVERAGE
  // (those rules apply design-wide), and that panel needs its own structural support --
  // but no product instance need sit on it, since STRUCTURAL_SUPPORT is a geometry-level check.
  const { json: partition2 } = await api(
    "POST",
    `/api/designs/${designId}/zones/${zone2.zone.id}/partitions`,
    { orderIndex: 0, widthMm: 1500, heightMm: 2400 },
  );
  const { json: panel2Result } = await api(
    "POST",
    `/api/designs/${designId}/partitions/${partition2.id}/panels`,
    { orderIndex: 0, widthMm: 1500, heightMm: 2400, orientation: "VERTICAL" },
  );
  const panel2 = panel2Result.panel;

  // 4. Place instances
  console.log("\n4. Place product instances (panel, back sheet, connector, trim, cove light, furniture)");
  const instance = async (code: string, extra: Record<string, unknown> = {}) => {
    const { json } = await api("POST", `/api/designs/${designId}/product-instances`, {
      skuId: await skuId(code),
      ...extra,
    });
    return json;
  };
  const panelInstance = await instance("SKU-PANEL-600", { geometryNodeId: panel.id });
  const backSheetInstance = await instance("SKU-PVC-BACK-01");
  const connectorInstance = await instance("SKU-CONNECTOR-H", { quantity: 2 });
  const trimInstance = await instance("SKU-TRIM-EDGE-01");
  const coveLightInstance = await instance("SKU-COVE-LIGHT-LED", { z: 1800 });
  const furnitureInstance = await instance("SKU-FURN-VANITY-01", { x: 100, y: 100 });
  const zone2BackSheetInstance = await instance("SKU-PVC-BACK-01");

  // 5. Relationships + instance edges
  console.log("\n5. Link flagged edges to instances; materialize a REQUIRES instance edge");
  const relTrim = await api("POST", `/api/designs/${designId}/geometry-product-relationships`, {
    geometryEdgeId: edgeStart.id,
    productInstanceId: trimInstance.id,
    relationshipType: "HAS_TREATMENT",
  });
  await api("POST", `/api/designs/${designId}/geometry-product-relationships`, {
    geometryEdgeId: edgeStart.id,
    productInstanceId: connectorInstance.id,
    relationshipType: "TERMINATES",
  });
  await api("POST", `/api/designs/${designId}/geometry-product-relationships`, {
    geometryEdgeId: edgeEnd.id,
    productInstanceId: coveLightInstance.id,
    relationshipType: "SUPPORTS",
  });
  const relStructural = await api("POST", `/api/designs/${designId}/geometry-product-relationships`, {
    geometryNodeId: panel.id,
    productInstanceId: backSheetInstance.id,
    relationshipType: "BOUNDARY_OF",
  });
  await api("POST", `/api/designs/${designId}/geometry-product-relationships`, {
    geometryNodeId: panel2.id,
    productInstanceId: zone2BackSheetInstance.id,
    relationshipType: "BOUNDARY_OF",
  });

  const edgeToBackSheet = await api("POST", `/api/designs/${designId}/product-instance-edges`, {
    fromInstanceId: panelInstance.id,
    toInstanceId: backSheetInstance.id,
    edgeType: "REQUIRES",
    sourceSkuEdgeId: await skuEdgeId("SKU-PANEL-600", "SKU-PVC-BACK-01"),
  });
  await api("POST", `/api/designs/${designId}/product-instance-edges`, {
    fromInstanceId: panelInstance.id,
    toInstanceId: connectorInstance.id,
    edgeType: "REQUIRES",
    sourceSkuEdgeId: await skuEdgeId("SKU-PANEL-600", "SKU-CONNECTOR-H"),
  });

  // 6. Validate (positive path)
  console.log("\n6. Run validation -- expect passed=true");
  const { json: validation } = await api("POST", `/api/designs/${designId}/validate`, {});
  if (!validation.passed) console.error("Validation issues:", validation.issues);
  assert(validation.passed === true, "design passes validation with zero errors");

  // 6b. Negative-path check on a second, incomplete design
  console.log("\n6b. Negative-path check: a design missing the trim relationship");
  const { json: badDesign } = await api("POST", "/api/designs", { name: "E2E Negative Path" });
  const badDesignId: string = badDesign.id;
  const { json: badWall } = await api("PUT", `/api/designs/${badDesignId}/wall`, {
    wallType: "STRAIGHT_LTR",
    lengthMm: 1000,
    heightMm: 2400,
  });
  const { json: badZone } = await api("POST", `/api/designs/${badDesignId}/zones`, {
    wallId: badWall.wall.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 1000,
    heightMm: 2400,
  });
  const { json: badPartition } = await api(
    "POST",
    `/api/designs/${badDesignId}/zones/${badZone.zone.id}/partitions`,
    { orderIndex: 0, widthMm: 1000, heightMm: 2400 },
  );
  const { json: badPanelResult } = await api(
    "POST",
    `/api/designs/${badDesignId}/partitions/${badPartition.id}/panels`,
    { orderIndex: 0, widthMm: 1000, heightMm: 2400, orientation: "VERTICAL" },
  );
  const badEdge = badPanelResult.edges[0];
  await api("PUT", `/api/designs/${badDesignId}/geometry-edges/${badEdge.id}`, { requiresTrim: true });
  const { json: badValidation } = await api("POST", `/api/designs/${badDesignId}/validate`, {});
  assert(badValidation.passed === false, "incomplete design fails validation");
  const trimIssue = badValidation.issues.find((i: { code: string }) => i.code === "EDGE_TREATMENT_TRIM");
  assert(Boolean(trimIssue), "validation reports EDGE_TREATMENT_TRIM");
  assert(trimIssue.refId === badEdge.id, "issue references the exact offending edge id");

  // 7. Master BOM
  console.log("\n7. Generate Master BOM -- assert provenance");
  const { json: bom } = await api("POST", `/api/designs/${designId}/bom`, {});
  const expectedLineCount = 5 /* relationships (incl. zone 2 structural) */ + 2 /* instance edges */ + 1 /* freestanding furniture */;
  assert(bom.lines.length === expectedLineCount, `BOM has ${expectedLineCount} lines`);

  const trimLine = bom.lines.find(
    (l: { sourceGeometryProductRelationshipId: string | null }) =>
      l.sourceGeometryProductRelationshipId === relTrim.json.id,
  );
  assert(Boolean(trimLine), "a line traces back to the trim relationship");
  assert(trimLine.skuId === trimInstance.skuId, "trim line's SKU matches the trim instance");

  const structuralLine = bom.lines.find(
    (l: { sourceGeometryProductRelationshipId: string | null }) =>
      l.sourceGeometryProductRelationshipId === relStructural.json.id,
  );
  assert(structuralLine.skuId === backSheetInstance.skuId, "structural line's SKU matches the back sheet");

  const instanceEdgeLine = bom.lines.find(
    (l: { sourceProductInstanceEdgeId: string | null }) =>
      l.sourceProductInstanceEdgeId === edgeToBackSheet.json.id,
  );
  assert(
    instanceEdgeLine.skuId === panelInstance.skuId,
    "instance-edge line's SKU matches the requiring instance (panel), not the required one",
  );

  const furnitureLine = bom.lines.find(
    (l: { sourceProductInstanceId: string | null }) => l.sourceProductInstanceId === furnitureInstance.id,
  );
  assert(Boolean(furnitureLine), "furniture instance produced its own freestanding BOM line");

  for (const line of bom.lines) {
    const sourceCount = [
      line.sourceGeometryProductRelationshipId,
      line.sourceProductInstanceEdgeId,
      line.sourceProductInstanceId,
    ].filter((v) => v != null).length;
    assert(sourceCount === 1, `line ${line.id} has exactly one provenance source`);
  }

  // 8. Publish, then assert immutability
  console.log("\n8. Publish -- assert status flips and further mutation is rejected");
  const { json: published, status: publishStatus } = await api(
    "POST",
    `/api/designs/${designId}/publish`,
    {},
  );
  assert(publishStatus === 200, "publish succeeds");
  assert(published.status === "PUBLISHED", "design status is PUBLISHED");

  const { status: mutateAfterPublishStatus } = await api(
    "POST",
    `/api/designs/${designId}/product-instances`,
    { skuId: await skuId("SKU-HW-SCREWKIT-01") },
  );
  assert(mutateAfterPublishStatus === 409, "mutating a published template is rejected with 409");

  // 9. Design Library
  console.log("\n9. Design Library lists the published template");
  const { json: library } = await api("GET", "/api/library");
  const listed = library.find((d: { id: string }) => d.id === designId);
  assert(Boolean(listed), "published template appears in the Design Library");
  assert(listed.name === "E2E Template", "listed template has the correct name");

  console.log(`\nAll ${assertions} assertions passed.`);
}

main().catch((err) => {
  console.error("\ne2e script FAILED:", err);
  process.exitCode = 1;
});
