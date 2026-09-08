import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/api/errors";

export async function publishTemplate(designId: string) {
  const [latestValidation, latestBom] = await Promise.all([
    prisma.designValidationResult.findFirst({ where: { designId }, orderBy: { ranAt: "desc" } }),
    prisma.masterBom.findFirst({ where: { templateId: designId } }),
  ]);

  if (!latestValidation || !latestValidation.passed) {
    throw conflict("Design must pass validation before it can be published");
  }
  if (!latestBom) {
    throw conflict("A Master BOM must be generated before the design can be published");
  }

  return prisma.design.update({
    where: { id: designId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
}
