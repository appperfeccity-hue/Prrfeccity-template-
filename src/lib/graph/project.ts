import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { assertSkuNotDiscontinued } from "@/lib/graph/sku";
import { assertOptionsBelongToSku } from "@/lib/graph/product";
import { ENUM_SELECTION_PARAM_KEYS } from "@/lib/graph/constants";
import type { ParameterType, Prisma } from "@/generated/prisma/client";

/**
 * Deep-copies a published Template's PRODUCT graph (not its geometry --
 * Wall/Zone/Partition/Panel/GeometryEdge never change once published, so a
 * Project references those rows directly rather than copying/remapping
 * them, unlike reviseTemplate's nodeIdMap/edgeIdMap). Only ProductInstance/
 * ProductInstanceEdge/GeometryProductRelationship get Project-owned copies,
 * each carrying a source*Id back-pointer to its Template origin -- that
 * back-pointer is what lets assertConsultantEditAllowed resolve which
 * TemplateParameter/ConsultantPermission governs a later bounded edit.
 */
export async function createProjectFromTemplate(templateId: string, name: string, createdByUserId: string) {
  const template = await prisma.design.findUnique({ where: { id: templateId } });
  if (!template) throw notFound(`Design ${templateId} not found`);
  if (template.status !== "PUBLISHED") {
    throw badRequest("Only a published Template can be used to create a Project");
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { name, templateId, createdByUserId } });
    const instanceIdMap = new Map<string, string>();

    const instances = await tx.productInstance.findMany({ where: { designId: templateId } });
    for (const inst of instances) {
      const created = await tx.projectProductInstance.create({
        data: {
          projectId: project.id,
          sourceProductInstanceId: inst.id,
          skuId: inst.skuId,
          geometryNodeId: inst.geometryNodeId,
          x: inst.x,
          y: inst.y,
          z: inst.z,
          rotationDeg: inst.rotationDeg,
          quantity: inst.quantity,
          designOptionId: inst.designOptionId,
          colourOptionId: inst.colourOptionId,
          sizeOptionId: inst.sizeOptionId,
        },
      });
      instanceIdMap.set(inst.id, created.id);
    }

    const edges = await tx.productInstanceEdge.findMany({ where: { designId: templateId } });
    for (const edge of edges) {
      await tx.projectProductInstanceEdge.create({
        data: {
          projectId: project.id,
          sourceProductInstanceEdgeId: edge.id,
          fromInstanceId: instanceIdMap.get(edge.fromInstanceId)!,
          toInstanceId: instanceIdMap.get(edge.toInstanceId)!,
          edgeType: edge.edgeType,
          sourceSkuEdgeId: edge.sourceSkuEdgeId,
        },
      });
    }

    const rels = await tx.geometryProductRelationship.findMany({ where: { designId: templateId } });
    for (const rel of rels) {
      await tx.projectGeometryProductRelationship.create({
        data: {
          projectId: project.id,
          sourceGeometryProductRelationshipId: rel.id,
          geometryEdgeId: rel.geometryEdgeId,
          geometryNodeId: rel.geometryNodeId,
          productInstanceId: instanceIdMap.get(rel.productInstanceId)!,
          relationshipType: rel.relationshipType,
          condition: rel.condition as Prisma.InputJsonValue | undefined,
          quantityRule: rel.quantityRule as Prisma.InputJsonValue | undefined,
        },
      });
    }

    return tx.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { productInstances: true },
    });
  });
}

type PermissionCheck = { kind: "numeric"; value: number } | { kind: "enum"; value: string };

type PermissionTarget = {
  paramType: ParameterType;
  targetProductInstanceId?: string;
  targetGeometryEdgeId?: string;
  paramKey?: string;
};

/**
 * The one place a Consultant's bounded edit is resolved + bounds-checked --
 * used by every mutator below. 403 covers both "no TemplateParameter
 * targets this field" and "one exists but editableByConsultant is false":
 * deliberately the same status, since from the caller's perspective the
 * field simply isn't exposed either way. 400 means the field IS exposed but
 * the given value falls outside its bounds.
 */
async function assertConsultantEditAllowed(
  templateId: string,
  target: PermissionTarget,
  check: PermissionCheck,
) {
  const found = await prisma.templateParameter.findFirst({
    where: {
      templateId,
      paramType: target.paramType,
      ...(target.targetProductInstanceId ? { targetProductInstanceId: target.targetProductInstanceId } : {}),
      ...(target.targetGeometryEdgeId ? { targetGeometryEdgeId: target.targetGeometryEdgeId } : {}),
      ...(target.paramKey ? { paramKey: target.paramKey } : {}),
    },
    include: { permission: true },
  });
  if (!found || !found.permission || !found.permission.editableByConsultant) {
    throw forbidden("This field is not exposed as an editable Consultant parameter on this Template");
  }
  const p = found.permission;
  if (check.kind === "numeric") {
    if (p.minValue != null && check.value < p.minValue) throw badRequest(`Value must be >= ${p.minValue}`);
    if (p.maxValue != null && check.value > p.maxValue) throw badRequest(`Value must be <= ${p.maxValue}`);
  } else {
    if (!p.allowedValues.includes(check.value)) {
      throw badRequest(`Value must be one of: ${p.allowedValues.join(", ")}`);
    }
  }
  return found;
}

export type UpdateProjectProductInstanceInput = {
  quantity?: number;
  rotationDeg?: number;
  x?: number;
  y?: number;
  z?: number;
  skuId?: string;
  designOptionId?: string | null;
  colourOptionId?: string | null;
  sizeOptionId?: string | null;
};

/**
 * Applies a Consultant-bounded edit to one field (or several) of an
 * already-snapshotted ProjectProductInstance, per the paramType -> field
 * mapping in the plan file's Phase 5 item 4 section. Every changed field is
 * checked before any write -- any throw aborts before the single final
 * .update() call, so this is naturally all-or-nothing without an explicit
 * transaction.
 */
export async function updateProjectProductInstance(
  projectId: string,
  projectInstanceId: string,
  input: UpdateProjectProductInstanceInput,
) {
  const instance = await prisma.projectProductInstance.findUnique({
    where: { id: projectInstanceId },
    include: { sku: true, project: true },
  });
  if (!instance || instance.projectId !== projectId) {
    throw notFound(`Project product instance ${projectInstanceId} not found in this project`);
  }
  // Synthesized by setProjectEdgeTreatment -- has no Template origin, so no
  // TemplateParameter lookup can ever resolve for it ("chained substitution
  // is not supported this pass", plan file).
  if (!instance.sourceProductInstanceId) {
    throw forbidden("This product instance has no Template origin and cannot be edited");
  }
  const sourceInstanceId = instance.sourceProductInstanceId;
  const templateId = instance.project.templateId;

  if (input.quantity !== undefined) {
    await assertConsultantEditAllowed(
      templateId,
      { targetProductInstanceId: sourceInstanceId, paramType: "QUANTITY" },
      { kind: "numeric", value: input.quantity },
    );
  }

  if (input.rotationDeg !== undefined) {
    // The fixed-physical-configuration constraint applies regardless of
    // whether a Consultant permission exists -- matches
    // updateProductInstance's own precedent in product.ts.
    if (input.rotationDeg !== instance.rotationDeg && !instance.sku.rotatable) {
      throw badRequest("This product's catalogue configuration does not permit rotation");
    }
    await assertConsultantEditAllowed(
      templateId,
      { targetProductInstanceId: sourceInstanceId, paramType: "NUMERIC_RANGE" },
      { kind: "numeric", value: input.rotationDeg },
    );
  }

  // POSITION bounds apply independently per supplied axis, against the one
  // shared minValue/maxValue range -- see the plan file's explicit
  // "one shared range, not three independent ranges" simplification.
  for (const axisValue of [input.x, input.y, input.z]) {
    if (axisValue !== undefined) {
      await assertConsultantEditAllowed(
        templateId,
        { targetProductInstanceId: sourceInstanceId, paramType: "POSITION" },
        { kind: "numeric", value: axisValue },
      );
    }
  }

  const targetSkuId = input.skuId ?? instance.skuId;
  if (input.skuId !== undefined && input.skuId !== instance.skuId) {
    const newSku = await prisma.skuMaster.findUnique({ where: { id: input.skuId } });
    if (!newSku) throw notFound(`SKU ${input.skuId} not found`);
    assertSkuNotDiscontinued(newSku);
    await assertConsultantEditAllowed(
      templateId,
      { targetProductInstanceId: sourceInstanceId, paramType: "SKU_SUBSTITUTION" },
      { kind: "enum", value: newSku.code },
    );
  }

  const hasOptionChange =
    input.designOptionId !== undefined || input.colourOptionId !== undefined || input.sizeOptionId !== undefined;
  if (hasOptionChange) {
    // Referential integrity against the (possibly just-substituted) SKU --
    // reuses the exact same belongs-to-SKU discipline product.ts already
    // enforces for ProductInstance edits.
    await assertOptionsBelongToSku(targetSkuId, input);

    if (input.designOptionId) {
      const opt = await prisma.furnitureDesignOption.findUniqueOrThrow({ where: { id: input.designOptionId } });
      await assertConsultantEditAllowed(
        templateId,
        { targetProductInstanceId: sourceInstanceId, paramType: "ENUM_SELECTION", paramKey: ENUM_SELECTION_PARAM_KEYS.DESIGN_OPTION },
        { kind: "enum", value: opt.key },
      );
    }
    if (input.colourOptionId) {
      const opt = await prisma.furnitureColourOption.findUniqueOrThrow({ where: { id: input.colourOptionId } });
      await assertConsultantEditAllowed(
        templateId,
        { targetProductInstanceId: sourceInstanceId, paramType: "ENUM_SELECTION", paramKey: ENUM_SELECTION_PARAM_KEYS.COLOUR_OPTION },
        { kind: "enum", value: opt.key },
      );
    }
    if (input.sizeOptionId) {
      const opt = await prisma.furnitureSizeOption.findUniqueOrThrow({ where: { id: input.sizeOptionId } });
      await assertConsultantEditAllowed(
        templateId,
        { targetProductInstanceId: sourceInstanceId, paramType: "ENUM_SELECTION", paramKey: ENUM_SELECTION_PARAM_KEYS.SIZE_OPTION },
        { kind: "enum", value: opt.key },
      );
    }
  }

  return prisma.projectProductInstance.update({
    where: { id: projectInstanceId },
    data: input,
  });
}

/**
 * EDGE_TREATMENT's mutator -- reassigns which SKU satisfies a flagged
 * geometry edge in this Project. Requires an existing
 * ProjectGeometryProductRelationship at geometryEdgeId (always present:
 * every flagged edge on a validated, published Template already has one,
 * per validation rules 7/8/9). Synthesizes a fresh ProjectProductInstance
 * (sourceProductInstanceId: null) only when the SKU actually changes, and
 * cleans up the old instance if nothing else in the Project still
 * references it -- avoids an orphaned row silently entering the Final
 * BOM's freestanding branch.
 */
export async function setProjectEdgeTreatment(projectId: string, geometryEdgeId: string, skuId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound(`Project ${projectId} not found`);

  const relationship = await prisma.projectGeometryProductRelationship.findFirst({
    where: { projectId, geometryEdgeId },
    include: { productInstance: true },
  });
  if (!relationship) {
    throw notFound(`No product relationship found at geometry edge ${geometryEdgeId} in this project`);
  }

  const newSku = await prisma.skuMaster.findUnique({ where: { id: skuId } });
  if (!newSku) throw notFound(`SKU ${skuId} not found`);
  assertSkuNotDiscontinued(newSku);

  await assertConsultantEditAllowed(
    project.templateId,
    { targetGeometryEdgeId: geometryEdgeId, paramType: "EDGE_TREATMENT" },
    { kind: "enum", value: newSku.code },
  );

  const oldInstance = relationship.productInstance;
  if (oldInstance.skuId === skuId) {
    return relationship;
  }

  return prisma.$transaction(async (tx) => {
    const newInstance = await tx.projectProductInstance.create({
      data: {
        projectId,
        sourceProductInstanceId: null,
        skuId,
        geometryNodeId: oldInstance.geometryNodeId,
        quantity: oldInstance.quantity,
      },
    });

    const updated = await tx.projectGeometryProductRelationship.update({
      where: { id: relationship.id },
      data: { productInstanceId: newInstance.id },
      include: { productInstance: true },
    });

    const [stillReferenced, stillLinked] = await Promise.all([
      tx.projectGeometryProductRelationship.findFirst({ where: { productInstanceId: oldInstance.id } }),
      tx.projectProductInstanceEdge.findFirst({
        where: { OR: [{ fromInstanceId: oldInstance.id }, { toInstanceId: oldInstance.id }] },
      }),
    ]);
    if (!stillReferenced && !stillLinked) {
      await tx.projectProductInstance.delete({ where: { id: oldInstance.id } });
    }

    return updated;
  });
}
