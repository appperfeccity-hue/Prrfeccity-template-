import { prisma } from "@/lib/prisma";
import { conflict, notFound } from "@/lib/api/errors";

export async function requireDraftDesign(designId: string) {
  const design = await prisma.design.findUnique({ where: { id: designId } });
  if (!design) throw notFound(`Design ${designId} not found`);
  if (design.status !== "DRAFT") {
    throw conflict("This template is published and can no longer be modified");
  }
  return design;
}

export async function requireDesign(designId: string) {
  const design = await prisma.design.findUnique({ where: { id: designId } });
  if (!design) throw notFound(`Design ${designId} not found`);
  return design;
}
