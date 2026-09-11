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

// Every route now requires a session cookie (RBAC) -- `api()` tracks the
// "current" session automatically (set by the most recent unoverridden
// login) so every pre-existing call site below keeps working unchanged
// once step 0 logs in. Pass `cookieOverride` to act as a *different*
// already-logged-in user without disturbing the default session -- used by
// the RBAC verification section to act as a throwaway Designer.
let sessionCookie: string | undefined;

async function api(method: string, path: string, body?: unknown, cookieOverride?: string) {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  const cookie = cookieOverride ?? sessionCookie;
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  const newCookie = setCookie ? setCookie.split(";")[0] : undefined;
  if (newCookie && cookieOverride === undefined) {
    sessionCookie = newCookie;
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, json, cookie: newCookie };
}

async function skuId(code: string): Promise<string> {
  const { json } = await api("GET", "/api/skus");
  const sku = json.find((s: { code: string }) => s.code === code);
  if (!sku) throw new Error(`Seed SKU ${code} not found -- did you run \`npm run db:seed\`?`);
  return sku.id;
}

async function furnitureSizeOptionId(code: string, key: string): Promise<string> {
  const id = await skuId(code);
  const { json } = await api("GET", `/api/skus/${id}`);
  const option = json.sizeOptions.find((o: { key: string }) => o.key === key);
  if (!option) throw new Error(`FurnitureSizeOption ${code}/${key} not found in seed data`);
  return option.id;
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

  // 0. Auth: every route requires a session now -- log in as the seeded
  // bootstrap Admin (prisma/seed.ts) before anything else. The resulting
  // cookie becomes the default session `api()` sends on every subsequent
  // call for the rest of the script.
  console.log("0. Auth: log in as the seeded bootstrap Admin");
  const { status: bootstrapLoginStatus, json: bootstrapLoginUser } = await api("POST", "/api/auth/login", {
    email: "admin@example.com",
    password: "changeme123",
  });
  assert(bootstrapLoginStatus === 200, "bootstrap Admin login succeeds");
  assert(bootstrapLoginUser.role === "ADMIN", "logged-in user's role is ADMIN");
  assert(Boolean(sessionCookie), "login sets a session cookie, used as the default session from here on");

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
    relationshipType: "ADJACENT_TO",
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
  const furnitureInstance = await instance("SKU-FURN-VANITY-01", {
    x: 100,
    y: 100,
    sizeOptionId: await furnitureSizeOptionId("SKU-FURN-VANITY-01", "SMALL"),
  });
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

  // 10. Auto-fill
  console.log("\n10. Auto-fill a partition (drag-and-drop equivalent)");
  const { json: autoFillDesign } = await api("POST", "/api/designs", { name: "E2E Auto-fill" });
  const { json: autoFillWall } = await api("PUT", `/api/designs/${autoFillDesign.id}/wall`, {
    wallType: "STRAIGHT_LTR",
    lengthMm: 1250,
    heightMm: 2400,
  });
  const { json: autoFillZone } = await api("POST", `/api/designs/${autoFillDesign.id}/zones`, {
    wallId: autoFillWall.wall.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 1250,
    heightMm: 2400,
  });
  const { json: autoFillPartition } = await api(
    "POST",
    `/api/designs/${autoFillDesign.id}/zones/${autoFillZone.zone.id}/partitions`,
    { orderIndex: 0, widthMm: 1250, heightMm: 2400 },
  );
  const panelSkuId = await skuId("SKU-PANEL-600");
  const { json: fillResult } = await api(
    "POST",
    `/api/designs/${autoFillDesign.id}/partitions/${autoFillPartition.id}/autofill`,
    { skuId: panelSkuId },
  );
  assert(fillResult.fill.count === 1, "1250mm/600mm auto-fill reduces count to 1 (avoids a sub-minimum offcut)");
  assert(fillResult.fill.remainderMm === 650, "remainder is the larger 650mm offcut, not 50mm");
  assert(fillResult.fill.offcutReusable === true, "650mm offcut is above the 100mm minimum, so it's reusable");

  console.log("  10b. Negative-path: a partition too narrow to reduce further");
  const { json: negDesign } = await api("POST", "/api/designs", { name: "E2E Auto-fill Sub-minimum" });
  const { json: negWall } = await api("PUT", `/api/designs/${negDesign.id}/wall`, {
    wallType: "STRAIGHT_LTR",
    lengthMm: 650,
    heightMm: 2400,
  });
  const { json: negZone } = await api("POST", `/api/designs/${negDesign.id}/zones`, {
    wallId: negWall.wall.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 650,
    heightMm: 2400,
  });
  const { json: negPartition } = await api(
    "POST",
    `/api/designs/${negDesign.id}/zones/${negZone.zone.id}/partitions`,
    { orderIndex: 0, widthMm: 650, heightMm: 2400 },
  );
  const { json: negFillResult } = await api(
    "POST",
    `/api/designs/${negDesign.id}/partitions/${negPartition.id}/autofill`,
    { skuId: panelSkuId },
  );
  assert(negFillResult.fill.count === 1, "650mm/600mm auto-fill can't reduce below 1 panel");
  assert(negFillResult.fill.offcutReusable === false, "sub-minimum 50mm offcut is flagged non-reusable");

  const { json: negValidation } = await api("POST", `/api/designs/${negDesign.id}/validate`, {});
  const wasteIssue = negValidation.issues.find((i: { code: string }) => i.code === "PANEL_OFFCUT_WASTE");
  assert(Boolean(wasteIssue), "validation reports PANEL_OFFCUT_WASTE for the sub-minimum offcut");
  assert(wasteIssue.severity === "WARNING", "PANEL_OFFCUT_WASTE is a WARNING, not an ERROR");

  console.log("  10c. Rejects auto-fill on a non-empty partition and on a SKU without defaultWidthMm");
  const { status: nonEmptyStatus } = await api(
    "POST",
    `/api/designs/${autoFillDesign.id}/partitions/${autoFillPartition.id}/autofill`,
    { skuId: panelSkuId },
  );
  assert(nonEmptyStatus === 400, "re-auto-filling an already-filled partition is rejected with 400");

  const hardwareSkuId = await skuId("SKU-HW-SCREWKIT-01");
  const { status: badSkuStatus } = await api(
    "POST",
    `/api/designs/${negDesign.id}/partitions/${negPartition.id}/autofill`,
    { skuId: hardwareSkuId },
  );
  assert(badSkuStatus === 400, "auto-filling with a non-PRIMARY SKU is rejected with 400");

  // 11. Move / resize / rotate / delete
  console.log("\n11. Move/resize/rotate/delete of already-placed instances");
  const { json: moveDesign } = await api("POST", "/api/designs", { name: "E2E Move/Resize/Rotate" });
  const { json: moveWall } = await api("PUT", `/api/designs/${moveDesign.id}/wall`, {
    wallType: "STRAIGHT_LTR",
    lengthMm: 1200,
    heightMm: 2400,
  });
  const { json: moveZone } = await api("POST", `/api/designs/${moveDesign.id}/zones`, {
    wallId: moveWall.wall.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 1200,
    heightMm: 2400,
  });
  const { json: movePartition } = await api(
    "POST",
    `/api/designs/${moveDesign.id}/zones/${moveZone.zone.id}/partitions`,
    { orderIndex: 0, widthMm: 1200, heightMm: 2400 },
  );
  const { json: movePanelResult } = await api(
    "POST",
    `/api/designs/${moveDesign.id}/partitions/${movePartition.id}/panels`,
    { orderIndex: 0, widthMm: 1200, heightMm: 2400, orientation: "VERTICAL" },
  );
  const { json: furnInstance } = await api("POST", `/api/designs/${moveDesign.id}/product-instances`, {
    skuId: await skuId("SKU-FURN-VANITY-01"),
    x: 100,
    y: 100,
    sizeOptionId: await furnitureSizeOptionId("SKU-FURN-VANITY-01", "SMALL"),
  });

  const { json: movedInstance } = await api(
    "PATCH",
    `/api/designs/${moveDesign.id}/product-instances/${furnInstance.id}`,
    { x: 400, y: 300, rotationDeg: 90 },
  );
  assert(movedInstance.x === 400 && movedInstance.y === 300, "PATCH moved the furniture instance");
  assert(movedInstance.rotationDeg === 90, "PATCH rotated the furniture instance");

  await api("PATCH", `/api/designs/${moveDesign.id}/panels/${movePanelResult.panel.id}`, { widthMm: 700 });
  const { json: coverageValidation } = await api("POST", `/api/designs/${moveDesign.id}/validate`, {});
  assert(
    coverageValidation.issues.some((i: { code: string }) => i.code === "PANEL_COVERAGE"),
    "resizing a panel without adjusting neighbors now fails PANEL_COVERAGE (no silent auto-repair)",
  );

  const { status: deleteInstanceStatus } = await api(
    "DELETE",
    `/api/designs/${moveDesign.id}/product-instances/${furnInstance.id}`,
  );
  assert(deleteInstanceStatus === 204, "DELETE removed the product instance");
  const { json: designAfterDelete } = await api("GET", `/api/designs/${moveDesign.id}`);
  assert(
    !designAfterDelete.productInstances.some((pi: { id: string }) => pi.id === furnInstance.id),
    "deleted instance is gone from the design (and would be excluded from a regenerated BOM)",
  );

  const { json: throwawayZone } = await api("POST", `/api/designs/${moveDesign.id}/zones`, {
    associatesWith: "STRUCTURE",
    orderIndex: 1,
    widthMm: 300,
    heightMm: 2400,
  });
  await api("POST", `/api/designs/${moveDesign.id}/zones/${throwawayZone.zone.id}/partitions`, {
    orderIndex: 0,
    widthMm: 300,
    heightMm: 2400,
  });
  const { status: deleteZoneStatus } = await api(
    "DELETE",
    `/api/designs/${moveDesign.id}/geometry-nodes/${throwawayZone.zone.id}`,
  );
  assert(deleteZoneStatus === 204, "DELETE via the generic geometry-nodes route removed the zone");
  const { json: designAfterZoneDelete } = await api("GET", `/api/designs/${moveDesign.id}`);
  assert(
    !designAfterZoneDelete.geometryNodes.some((n: { id: string }) => n.id === throwawayZone.zone.id) &&
      !designAfterZoneDelete.geometryNodes.some(
        (n: { nodeType: string; partition?: { zoneId: string } }) =>
          n.nodeType === "PARTITION" && n.partition?.zoneId === throwawayZone.zone.id,
      ),
    "deleting the zone cascaded away its partition too",
  );

  // 12. Zone relationship types
  console.log("\n12. Zone relationship types: spatial vs. non-spatial");
  const { json: relDesign } = await api("POST", "/api/designs", { name: "E2E Zone Relationship Types" });
  const { json: relWall } = await api("PUT", `/api/designs/${relDesign.id}/wall`, {
    wallType: "STRAIGHT_LTR",
    lengthMm: 2000,
    heightMm: 2400,
  });
  const { json: relZoneA } = await api("POST", `/api/designs/${relDesign.id}/zones`, {
    wallId: relWall.wall.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 1000,
    heightMm: 2400,
  });
  const { json: relZoneB } = await api("POST", `/api/designs/${relDesign.id}/zones`, {
    wallId: relWall.wall.id,
    associatesWith: "WALL",
    orderIndex: 1,
    widthMm: 1000,
    heightMm: 2400,
  });
  const relEdgeA = relZoneA.edges.find((e: { edgeRole: string }) => e.edgeRole === "OUTER_BOUNDARY").id;
  const relEdgeB = relZoneB.edges.find((e: { edgeRole: string }) => e.edgeRole === "OUTER_BOUNDARY").id;

  const { json: continuesRel } = await api(
    "POST",
    `/api/designs/${relDesign.id}/geometry-edge-relationships`,
    { edgeAId: relEdgeA, edgeBId: relEdgeB, relationshipType: "CONTINUES_TO" },
  );
  const { json: continuesValidation } = await api("POST", `/api/designs/${relDesign.id}/validate`, {});
  assert(
    continuesValidation.issues.some((i: { code: string }) => i.code === "ZONE_ADJACENCY_INTEGRITY"),
    "CONTINUES_TO does not satisfy ZONE_ADJACENCY_INTEGRITY (not spatial adjacency)",
  );

  await api("DELETE", `/api/designs/${relDesign.id}/geometry-edge-relationships/${continuesRel.id}`);
  await api("POST", `/api/designs/${relDesign.id}/geometry-edge-relationships`, {
    edgeAId: relEdgeA,
    edgeBId: relEdgeB,
    relationshipType: "MEETS",
  });
  const { json: meetsValidation } = await api("POST", `/api/designs/${relDesign.id}/validate`, {});
  assert(
    !meetsValidation.issues.some((i: { code: string }) => i.code === "ZONE_ADJACENCY_INTEGRITY"),
    "MEETS satisfies ZONE_ADJACENCY_INTEGRITY",
  );

  // 13. quantityRule
  console.log("\n13. quantityRule PER_LENGTH_MM overrides the BOM line's quantity");
  const { json: qrDesign } = await api("POST", "/api/designs", { name: "E2E QuantityRule" });
  const { json: qrWall } = await api("PUT", `/api/designs/${qrDesign.id}/wall`, {
    wallType: "STRAIGHT_LTR",
    lengthMm: 600,
    heightMm: 2400,
  });
  const { json: qrZone } = await api("POST", `/api/designs/${qrDesign.id}/zones`, {
    wallId: qrWall.wall.id,
    associatesWith: "WALL",
    orderIndex: 0,
    widthMm: 600,
    heightMm: 2400,
  });
  const { json: qrPartition } = await api(
    "POST",
    `/api/designs/${qrDesign.id}/zones/${qrZone.zone.id}/partitions`,
    { orderIndex: 0, widthMm: 600, heightMm: 2400 },
  );
  const { json: qrPanelResult } = await api(
    "POST",
    `/api/designs/${qrDesign.id}/partitions/${qrPartition.id}/panels`,
    { orderIndex: 0, widthMm: 600, heightMm: 2400, orientation: "VERTICAL" },
  );
  const { json: qrStructInstance } = await api("POST", `/api/designs/${qrDesign.id}/product-instances`, {
    skuId: await skuId("SKU-PVC-BACK-01"),
  });
  const { json: qrRel } = await api("POST", `/api/designs/${qrDesign.id}/geometry-product-relationships`, {
    geometryNodeId: qrPanelResult.panel.id,
    productInstanceId: qrStructInstance.id,
    relationshipType: "BOUNDARY_OF",
    quantityRule: { type: "PER_LENGTH_MM", perMm: 0.01 },
  });
  await api("POST", `/api/designs/${qrDesign.id}/validate`, {});
  const { json: qrBom } = await api("POST", `/api/designs/${qrDesign.id}/bom`, {});
  const qrLine = qrBom.lines.find(
    (l: { sourceGeometryProductRelationshipId: string | null }) => l.sourceGeometryProductRelationshipId === qrRel.id,
  );
  assert(Boolean(qrLine), "quantityRule relationship produced a BOM line");
  assert(qrLine.quantity === 6, "PER_LENGTH_MM (600mm * 0.01) overrides quantity to 6, not the placed quantity of 1");

  // 14. L-Type wall corner angle must be exactly 90 degrees
  console.log("\n14. L-Type wall requires an exact 90-degree corner angle");
  const { json: cornerDesign1 } = await api("POST", "/api/designs", { name: "E2E Corner Angle Default" });
  const { json: cornerResult1, status: cornerStatus1 } = await api("PUT", `/api/designs/${cornerDesign1.id}/wall`, {
    wallType: "L_TYPE",
    lengthMm: 2000,
    heightMm: 2400,
  });
  assert(cornerStatus1 === 201, "omitting cornerAngleDeg on an L-Type wall is accepted");
  assert(cornerResult1.wall.cornerAngleDeg === 90, "omitted cornerAngleDeg defaults to 90");

  const { json: cornerDesign2 } = await api("POST", "/api/designs", { name: "E2E Corner Angle Wrong" });
  const { status: cornerStatus2 } = await api("PUT", `/api/designs/${cornerDesign2.id}/wall`, {
    wallType: "L_TYPE",
    lengthMm: 2000,
    heightMm: 2400,
    cornerAngleDeg: 45,
  });
  assert(cornerStatus2 === 400, "an explicit non-90 cornerAngleDeg on an L-Type wall is rejected with 400");

  const { json: cornerDesign3 } = await api("POST", "/api/designs", { name: "E2E Corner Angle Correct" });
  const { status: cornerStatus3 } = await api("PUT", `/api/designs/${cornerDesign3.id}/wall`, {
    wallType: "L_TYPE",
    lengthMm: 2000,
    heightMm: 2400,
    cornerAngleDeg: 90,
  });
  assert(cornerStatus3 === 201, "an explicit cornerAngleDeg of 90 on an L-Type wall is accepted");

  // 15. Suggested Relationships: accepting a suggestion is a plain, explicit,
  // client-composed create -- this proves the server-side contract that
  // makes the compute-client-side-suggest/click-to-accept UI possible.
  console.log("\n15. Suggested Relationships: accepting a suggestion creates a tagged ProductInstanceEdge");
  const { json: suggDesign } = await api("POST", "/api/designs", { name: "E2E Suggested Relationships" });
  const { json: suggParentInstance } = await api("POST", `/api/designs/${suggDesign.id}/product-instances`, {
    skuId: await skuId("SKU-PANEL-600"),
  });
  const suggSkuEdgeId = await skuEdgeId("SKU-PANEL-600", "SKU-PVC-BACK-01");
  const { json: suggChildInstance } = await api("POST", `/api/designs/${suggDesign.id}/product-instances`, {
    skuId: await skuId("SKU-PVC-BACK-01"),
  });
  const { json: suggEdge, status: suggEdgeStatus } = await api(
    "POST",
    `/api/designs/${suggDesign.id}/product-instance-edges`,
    {
      fromInstanceId: suggParentInstance.id,
      toInstanceId: suggChildInstance.id,
      edgeType: "REQUIRES",
      sourceSkuEdgeId: suggSkuEdgeId,
      origin: "CATALOG_DERIVED",
    },
  );
  assert(suggEdgeStatus === 201, "accepting a suggestion creates a ProductInstanceEdge");
  assert(suggEdge.origin === "CATALOG_DERIVED", "the accepted edge is tagged origin=CATALOG_DERIVED");
  assert(suggEdge.sourceSkuEdgeId === suggSkuEdgeId, "the accepted edge traces back to the exact catalog SkuEdge");

  const { json: suggDesignAfter } = await api("GET", `/api/designs/${suggDesign.id}`);
  const manualEdge = suggDesignAfter.productInstanceEdges.find(
    (e: { id: string }) => e.id !== suggEdge.id,
  );
  assert(!manualEdge, "no other ProductInstanceEdge was silently created alongside the accepted one");

  // 16. SKU Master versioning: prove the live wiring end-to-end over the real
  // HTTP routes, without mutating shared seed catalog data (the mutation
  // path -- version bump on edit, cosmetic no-bump, discontinue blocking --
  // is already covered thoroughly by tests/sku-versioning.test.ts against
  // isolated throwaway SkuMaster rows).
  console.log("\n16. SKU Master versioning: currentVersion/discontinuedAt live end-to-end, BOM lines pin skuVersionId");
  const trimSkuId = await skuId("SKU-TRIM-EDGE-01");
  const { json: trimSkuDetail } = await api("GET", `/api/skus/${trimSkuId}`);
  assert(trimSkuDetail.currentVersion === 1, "GET /api/skus/:id returns currentVersion");
  assert(trimSkuDetail.discontinuedAt === null, "a never-discontinued SKU has discontinuedAt: null");

  const trimBomLine = bom.lines.find((l: { sourceGeometryProductRelationshipId: string | null }) => l.sourceGeometryProductRelationshipId === relTrim.json.id);
  assert(Boolean(trimBomLine.skuVersionId), "the BOM line generated in step 7 was pinned to a skuVersionId");

  // 17. RBAC: a representative sample proving the mechanism end-to-end over
  // real HTTP with real cookies -- requireUser/requireRole themselves are
  // covered exhaustively by tests/auth.test.ts; this just proves the wiring
  // actually works when hit as a real client, not just in unit isolation.
  console.log("\n17. RBAC: role enforcement over real HTTP with real cookies");

  const { status: unauthStatus } = await api("GET", "/api/designs", undefined, "");
  assert(unauthStatus === 401, "a request with no session cookie is rejected 401 from a protected route");

  const trimSkuIdForRbac = await skuId("SKU-TRIM-EDGE-01");
  const { json: trimDetailForRbac } = await api("GET", `/api/skus/${trimSkuIdForRbac}`);
  const { status: adminPatchStatus } = await api("PATCH", `/api/skus/${trimSkuIdForRbac}`, {
    name: trimDetailForRbac.name,
  });
  assert(adminPatchStatus === 200, "ADMIN (the default logged-in session) succeeds on an ADMIN-only route (PATCH /api/skus/:id)");

  const designerEmail = `e2e-throwaway-designer-${Date.now()}@example.com`;
  const { status: createDesignerStatus } = await api("POST", "/api/users", {
    email: designerEmail,
    password: "e2e-throwaway-designer-pw",
    name: "E2E Throwaway Designer",
    role: "DESIGNER",
  });
  assert(createDesignerStatus === 201, "ADMIN can create a new Designer user via POST /api/users");

  const { status: designerLoginStatus, cookie: designerCookie } = await api(
    "POST",
    "/api/auth/login",
    { email: designerEmail, password: "e2e-throwaway-designer-pw" },
    "",
  );
  assert(designerLoginStatus === 200, "the throwaway Designer can log in");
  assert(Boolean(designerCookie), "Designer login sets its own session cookie, independent of the Admin session");

  const { status: designerPatchStatus } = await api(
    "PATCH",
    `/api/skus/${trimSkuIdForRbac}`,
    { name: trimDetailForRbac.name },
    designerCookie,
  );
  assert(designerPatchStatus === 403, "DESIGNER is rejected 403 from the same ADMIN-only route");

  const { status: designerCreateDesignStatus } = await api(
    "POST",
    "/api/designs",
    { name: "E2E RBAC Designer-created Design" },
    designerCookie,
  );
  assert(designerCreateDesignStatus === 201, "DESIGNER succeeds on an ADMIN+DESIGNER route (POST /api/designs)");

  console.log(`\nAll ${assertions} assertions passed.`);
}

main().catch((err) => {
  console.error("\ne2e script FAILED:", err);
  process.exitCode = 1;
});
