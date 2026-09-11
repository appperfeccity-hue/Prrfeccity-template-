import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api/errors";
import type { Prisma } from "@/generated/prisma/client";

// Editing any of these on a SkuMaster is a physical/rule change and must
// bump currentVersion + freeze a new SkuMasterVersion snapshot, so every
// already-generated MasterBomLine pinned to the prior version keeps
// resolving to exactly what was true when it was generated. code/name are
// deliberately excluded -- cosmetic catalog edits, not physical/rule
// changes (mirrors "price changes don't republish").
const VERSION_BUMPING_FIELDS = [
  "categoryId",
  "defaultWidthMm",
  "defaultUnit",
  "minCutPieceMm",
  "attributes",
  "rotatable",
] as const;

export type UpdateSkuMasterInput = {
  code?: string;
  name?: string;
  categoryId?: string;
  defaultWidthMm?: number | null;
  defaultUnit?: string;
  minCutPieceMm?: number | null;
  attributes?: unknown;
  rotatable?: boolean;
};

export async function updateSkuMaster(id: string, input: UpdateSkuMasterInput) {
  const existing = await prisma.skuMaster.findUnique({ where: { id } });
  if (!existing) throw notFound(`SKU ${id} not found`);

  const bumpsVersion = VERSION_BUMPING_FIELDS.some((field) => {
    if (!(field in input)) return false;
    const nextValue = input[field as keyof UpdateSkuMasterInput];
    const currentValue = existing[field as keyof typeof existing];
    if (field === "attributes") return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
    return nextValue !== currentValue;
  });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.skuMaster.update({
      where: { id },
      data: {
        code: input.code,
        name: input.name,
        categoryId: input.categoryId,
        defaultWidthMm: input.defaultWidthMm,
        defaultUnit: input.defaultUnit,
        minCutPieceMm: input.minCutPieceMm,
        attributes: input.attributes as Prisma.InputJsonValue | undefined,
        rotatable: input.rotatable,
        currentVersion: bumpsVersion ? { increment: 1 } : undefined,
      },
    });

    if (bumpsVersion) {
      await tx.skuMasterVersion.create({
        data: {
          skuId: updated.id,
          version: updated.currentVersion,
          code: updated.code,
          name: updated.name,
          categoryId: updated.categoryId,
          defaultWidthMm: updated.defaultWidthMm,
          defaultUnit: updated.defaultUnit,
          minCutPieceMm: updated.minCutPieceMm,
          attributes: updated.attributes as Prisma.InputJsonValue | undefined,
          rotatable: updated.rotatable,
        },
      });
    }

    return updated;
  });
}

// Discontinuation is a lifecycle status flag, not a physical/rule change --
// it does NOT bump currentVersion. It only blocks NEW placement (see
// assertSkuNotDiscontinued below); every existing instance/BOM line stays
// valid, matching "discontinued SKUs stay historically valid."
export async function discontinueSkuMaster(id: string) {
  const existing = await prisma.skuMaster.findUnique({ where: { id } });
  if (!existing) throw notFound(`SKU ${id} not found`);
  if (existing.discontinuedAt) return existing;
  return prisma.skuMaster.update({ where: { id }, data: { discontinuedAt: new Date() } });
}

export function assertSkuNotDiscontinued(sku: { discontinuedAt: Date | null; code: string }) {
  if (sku.discontinuedAt) {
    throw badRequest(`SKU ${sku.code} is discontinued and cannot be used for new placements`);
  }
}
