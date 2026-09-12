import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api/errors";
import type { Prisma, ConstraintTargetKind } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Deep-copies a published Template's entire graph into a new DRAFT version.
 * Validation results and Master BOMs are never copied forward -- the new
 * version must be re-validated and re-generate its own BOM from scratch.
 */
export async function reviseTemplate(templateId: string) {
  const parent = await prisma.design.findUnique({ where: { id: templateId } });
  if (!parent) throw badRequest(`Design ${templateId} not found`);
  if (parent.status !== "PUBLISHED") {
    throw badRequest("Only a published Template can be revised");
  }

  return prisma.$transaction(async (tx: Tx) => {
    const child = await tx.design.create({
      data: {
        name: parent.name,
        description: parent.description,
        tags: parent.tags,
        thumbnailUrl: parent.thumbnailUrl,
        version: parent.version + 1,
        status: "DRAFT",
        parentTemplateId: parent.id,
        rootTemplateId: parent.rootTemplateId ?? parent.id,
        libraryRoomType: parent.libraryRoomType,
        lookId: parent.lookId,
        pricePerSqFt: parent.pricePerSqFt,
        areaSqFt: parent.areaSqFt,
        isFavorited: parent.isFavorited,
      },
    });

    const nodeIdMap = new Map<string, string>();
    const edgeIdMap = new Map<string, string>();
    const instanceIdMap = new Map<string, string>();
    const fixtureIdMap = new Map<string, string>();

    const [segments, zones, partitions, panels] = await Promise.all([
      tx.wallSegment.findMany({ where: { designId: templateId } }),
      tx.zone.findMany({ where: { designId: templateId } }),
      tx.zonePartition.findMany({ where: { designId: templateId } }),
      tx.panel.findMany({ where: { designId: templateId } }),
    ]);

    for (const segment of segments) {
      const newId = randomUUID();
      nodeIdMap.set(segment.id, newId);
      await tx.geometryNode.create({
        data: { id: newId, designId: child.id, nodeType: "WALL" },
      });
      await tx.wallSegment.create({
        data: {
          id: newId,
          designId: child.id,
          sequence: segment.sequence,
          lengthMm: segment.lengthMm,
          heightMm: segment.heightMm,
        },
      });
    }

    // WallJunction has no FK dependents and no analog to remap beyond its
    // two segment ids -- must run after the segment loop above so
    // nodeIdMap already has both endpoints. Omitting this would silently
    // drop the junction on Template revision, the same ripple-effect bug
    // class this plan file has caught before (RelationshipOrigin, Furniture
    // options, Fixture).
    const junctions = await tx.wallJunction.findMany({ where: { designId: templateId } });
    for (const junction of junctions) {
      await tx.wallJunction.create({
        data: {
          designId: child.id,
          segmentAId: nodeIdMap.get(junction.segmentAId)!,
          segmentBId: nodeIdMap.get(junction.segmentBId)!,
          angleDeg: junction.angleDeg,
        },
      });
    }

    for (const zone of zones) {
      const newId = randomUUID();
      nodeIdMap.set(zone.id, newId);
      await tx.geometryNode.create({ data: { id: newId, designId: child.id, nodeType: "ZONE" } });
      await tx.zone.create({
        data: {
          id: newId,
          designId: child.id,
          wallSegmentId: zone.wallSegmentId ? nodeIdMap.get(zone.wallSegmentId) : null,
          associatesWith: zone.associatesWith,
          orderIndex: zone.orderIndex,
          widthMm: zone.widthMm,
          heightMm: zone.heightMm,
          hasCoveLighting: zone.hasCoveLighting,
          coveLightZMm: zone.coveLightZMm,
        },
      });
    }

    for (const partition of partitions) {
      const newId = randomUUID();
      nodeIdMap.set(partition.id, newId);
      await tx.geometryNode.create({ data: { id: newId, designId: child.id, nodeType: "PARTITION" } });
      await tx.zonePartition.create({
        data: {
          id: newId,
          designId: child.id,
          zoneId: nodeIdMap.get(partition.zoneId)!,
          orderIndex: partition.orderIndex,
          widthMm: partition.widthMm,
          heightMm: partition.heightMm,
        },
      });
    }

    for (const panel of panels) {
      const newId = randomUUID();
      nodeIdMap.set(panel.id, newId);
      await tx.geometryNode.create({ data: { id: newId, designId: child.id, nodeType: "PANEL" } });
      await tx.panel.create({
        data: {
          id: newId,
          designId: child.id,
          partitionId: nodeIdMap.get(panel.partitionId)!,
          orderIndex: panel.orderIndex,
          widthMm: panel.widthMm,
          heightMm: panel.heightMm,
          orientation: panel.orientation,
          isOffcut: panel.isOffcut,
          offcutReusable: panel.offcutReusable,
        },
      });
    }

    const edges = await tx.geometryEdge.findMany({ where: { designId: templateId } });
    for (const edge of edges) {
      const newId = randomUUID();
      edgeIdMap.set(edge.id, newId);
      await tx.geometryEdge.create({
        data: {
          id: newId,
          designId: child.id,
          nodeId: nodeIdMap.get(edge.nodeId)!,
          edgeRole: edge.edgeRole,
          requiresTermination: edge.requiresTermination,
          requiresConnector: edge.requiresConnector,
          requiresTrim: edge.requiresTrim,
          isLightingBoundary: edge.isLightingBoundary,
          metadata: edge.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    }

    const edgeRelationships = await tx.geometryEdgeRelationship.findMany({
      where: { designId: templateId },
    });
    for (const rel of edgeRelationships) {
      await tx.geometryEdgeRelationship.create({
        data: {
          designId: child.id,
          edgeAId: edgeIdMap.get(rel.edgeAId)!,
          edgeBId: edgeIdMap.get(rel.edgeBId)!,
          relationshipType: rel.relationshipType,
        },
      });
    }

    const instances = await tx.productInstance.findMany({ where: { designId: templateId } });
    for (const instance of instances) {
      const created = await tx.productInstance.create({
        data: {
          designId: child.id,
          skuId: instance.skuId,
          geometryNodeId: instance.geometryNodeId ? nodeIdMap.get(instance.geometryNodeId) : null,
          wallSegmentId: instance.wallSegmentId ? nodeIdMap.get(instance.wallSegmentId) : null,
          x: instance.x,
          y: instance.y,
          z: instance.z,
          rotationDeg: instance.rotationDeg,
          quantity: instance.quantity,
          // Catalogue option ids are SKU-scoped, not design-scoped -- they
          // stay valid as-is across a revision, no remap needed.
          designOptionId: instance.designOptionId,
          colourOptionId: instance.colourOptionId,
          sizeOptionId: instance.sizeOptionId,
        },
      });
      instanceIdMap.set(instance.id, created.id);
    }

    const instanceEdges = await tx.productInstanceEdge.findMany({ where: { designId: templateId } });
    for (const edge of instanceEdges) {
      await tx.productInstanceEdge.create({
        data: {
          designId: child.id,
          fromInstanceId: instanceIdMap.get(edge.fromInstanceId)!,
          toInstanceId: instanceIdMap.get(edge.toInstanceId)!,
          edgeType: edge.edgeType,
          sourceSkuEdgeId: edge.sourceSkuEdgeId,
          origin: edge.origin,
        },
      });
    }

    const geometryProductRelationships = await tx.geometryProductRelationship.findMany({
      where: { designId: templateId },
    });
    for (const rel of geometryProductRelationships) {
      await tx.geometryProductRelationship.create({
        data: {
          designId: child.id,
          geometryEdgeId: rel.geometryEdgeId ? edgeIdMap.get(rel.geometryEdgeId) : null,
          geometryNodeId: rel.geometryNodeId ? nodeIdMap.get(rel.geometryNodeId) : null,
          productInstanceId: instanceIdMap.get(rel.productInstanceId)!,
          relationshipType: rel.relationshipType,
          condition: rel.condition as Prisma.InputJsonValue | undefined,
          quantityRule: rel.quantityRule as Prisma.InputJsonValue | undefined,
          origin: rel.origin,
        },
      });
    }

    const parameters = await tx.templateParameter.findMany({
      where: { templateId },
      include: { permission: true },
    });
    for (const param of parameters) {
      const newParam = await tx.templateParameter.create({
        data: {
          templateId: child.id,
          targetProductInstanceId: param.targetProductInstanceId
            ? instanceIdMap.get(param.targetProductInstanceId)
            : null,
          targetGeometryEdgeId: param.targetGeometryEdgeId
            ? edgeIdMap.get(param.targetGeometryEdgeId)
            : null,
          paramKey: param.paramKey,
          paramType: param.paramType,
          label: param.label,
          defaultValue: param.defaultValue,
          unit: param.unit,
        },
      });
      if (param.permission) {
        await tx.consultantPermission.create({
          data: {
            templateParameterId: newParam.id,
            editableByConsultant: param.permission.editableByConsultant,
            minValue: param.permission.minValue,
            maxValue: param.permission.maxValue,
            allowedValues: param.permission.allowedValues,
          },
        });
      }
    }

    // Fixtures had no FK dependents of their own before the Constraint graph
    // landed -- fixtureIdMap didn't need to exist until a Constraint could
    // reference a Fixture endpoint. wallSegmentId does need remapping via
    // nodeIdMap, same as ProductInstance's own identical field.
    const fixtures = await tx.fixture.findMany({ where: { designId: templateId } });
    for (const fx of fixtures) {
      const created = await tx.fixture.create({
        data: {
          designId: child.id,
          fixtureType: fx.fixtureType,
          label: fx.label,
          wallSegmentId: fx.wallSegmentId ? nodeIdMap.get(fx.wallSegmentId) : null,
          xMm: fx.xMm,
          yMm: fx.yMm,
          widthMm: fx.widthMm,
          heightMm: fx.heightMm,
          clearanceMm: fx.clearanceMm,
        },
      });
      fixtureIdMap.set(fx.id, created.id);
    }

    // Constraint endpoints are remapped via whichever id map matches their
    // kind -- Fixture/ProductInstance/GeometryNode/GeometryEdge -- all four
    // maps are populated by this point. Must run after every other loop
    // above, or a revised Template would silently lose every Constraint,
    // the same ripple-effect bug class already caught for RelationshipOrigin,
    // the three Furniture-option FKs, Fixture, and WallJunction.
    const remapEndpoint = (
      kind: ConstraintTargetKind | null,
      fixtureId: string | null,
      productInstanceId: string | null,
      geometryNodeId: string | null,
      geometryEdgeId: string | null,
    ): { kind: ConstraintTargetKind; id: string } | null => {
      if (kind === "FIXTURE") return { kind, id: fixtureIdMap.get(fixtureId!)! };
      if (kind === "PRODUCT_INSTANCE") return { kind, id: instanceIdMap.get(productInstanceId!)! };
      if (kind === "GEOMETRY_NODE") return { kind, id: nodeIdMap.get(geometryNodeId!)! };
      if (kind === "GEOMETRY_EDGE") return { kind, id: edgeIdMap.get(geometryEdgeId!)! };
      return null;
    };
    const constraints = await tx.constraint.findMany({ where: { designId: templateId } });
    for (const c of constraints) {
      const a = remapEndpoint(
        c.targetAKind,
        c.targetAFixtureId,
        c.targetAProductInstanceId,
        c.targetAGeometryNodeId,
        c.targetAGeometryEdgeId,
      )!;
      const b = remapEndpoint(
        c.targetBKind,
        c.targetBFixtureId,
        c.targetBProductInstanceId,
        c.targetBGeometryNodeId,
        c.targetBGeometryEdgeId,
      );
      await tx.constraint.create({
        data: {
          designId: child.id,
          constraintType: c.constraintType,
          axis: c.axis,
          valueMm: c.valueMm,
          minValueMm: c.minValueMm,
          maxValueMm: c.maxValueMm,
          targetAKind: a.kind,
          targetAFixtureId: a.kind === "FIXTURE" ? a.id : null,
          targetAProductInstanceId: a.kind === "PRODUCT_INSTANCE" ? a.id : null,
          targetAGeometryNodeId: a.kind === "GEOMETRY_NODE" ? a.id : null,
          targetAGeometryEdgeId: a.kind === "GEOMETRY_EDGE" ? a.id : null,
          targetBKind: b?.kind ?? null,
          targetBFixtureId: b?.kind === "FIXTURE" ? b.id : null,
          targetBProductInstanceId: b?.kind === "PRODUCT_INSTANCE" ? b.id : null,
          targetBGeometryNodeId: b?.kind === "GEOMETRY_NODE" ? b.id : null,
          targetBGeometryEdgeId: b?.kind === "GEOMETRY_EDGE" ? b.id : null,
        },
      });
    }

    return child;
  });
}
