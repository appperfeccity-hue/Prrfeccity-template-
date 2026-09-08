import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { notFound } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const design = await prisma.design.findUnique({
      where: { id },
      include: {
        geometryNodes: {
          include: { wall: true, zone: true, partition: true, panel: true, edges: true },
        },
        geometryEdgeRelationships: true,
        productInstances: { include: { sku: true } },
        productInstanceEdges: true,
        geometryProductRelationships: true,
        templateParameters: { include: { permission: true } },
        validationResults: { orderBy: { ranAt: "desc" }, take: 1 },
        masterBoms: { orderBy: { version: "desc" }, take: 1, include: { lines: true } },
      },
    });
    if (!design) throw notFound(`Design ${id} not found`);
    return NextResponse.json(design);
  } catch (err) {
    return errorResponse(err);
  }
}
