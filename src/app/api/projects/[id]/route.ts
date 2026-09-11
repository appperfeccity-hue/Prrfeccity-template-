import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, notFound } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { requireProjectOwnerOrAdmin } from "@/lib/api/project-guards";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(req, ["ADMIN", "CONSULTANT"]);
    const { id } = await params;
    await requireProjectOwnerOrAdmin(id, user);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        // Only the fields the Project detail UI actually needs from its
        // Template -- not a full FullDesign-shaped geometry graph, since
        // geometry is read directly through ProjectProductInstance's own
        // geometryNodeId reference, not re-fetched via the template here.
        template: {
          include: { templateParameters: { include: { permission: true } } },
        },
        productInstances: {
          include: {
            sku: { include: { category: true, designOptions: true, colourOptions: true, sizeOptions: true } },
          },
        },
        productInstanceEdges: true,
        geometryProductRelationships: true,
      },
    });
    if (!project) throw notFound(`Project ${id} not found`);
    return NextResponse.json(project);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(req, ["ADMIN", "CONSULTANT"]);
    const { id } = await params;
    await requireProjectOwnerOrAdmin(id, user);
    await prisma.project.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
