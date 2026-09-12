import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { notFound } from "@/lib/api/errors";
import { requireDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { updateDesignSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const design = await prisma.design.findUnique({
      where: { id },
      include: {
        geometryNodes: {
          include: {
            wallSegment: true,
            zone: true,
            partition: true,
            panel: true,
            primitiveLine: true,
            edges: true,
          },
        },
        geometryEdgeRelationships: true,
        wallJunctions: true,
        productInstances: {
          include: {
            sku: { include: { category: true, designOptions: true, colourOptions: true, sizeOptions: true } },
            designOption: true,
            colourOption: true,
            sizeOption: true,
          },
        },
        productInstanceEdges: true,
        geometryProductRelationships: true,
        templateParameters: { include: { permission: true } },
        validationResults: { orderBy: { ranAt: "desc" }, take: 1 },
        masterBoms: { orderBy: { version: "desc" }, take: 1, include: { lines: true } },
        fixtures: true,
        constraints: true,
      },
    });
    if (!design) throw notFound(`Design ${id} not found`);
    return NextResponse.json(design);
  } catch (err) {
    return errorResponse(err);
  }
}

// Library presentation metadata only (room type / look / price / area / favorite) --
// not gated by requireDraftDesign since it's not part of the design graph and must
// stay editable after publish.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    await requireDesign(id);
    const body = updateDesignSchema.parse(await req.json());
    const design = await prisma.design.update({ where: { id }, data: body });
    return NextResponse.json(design);
  } catch (err) {
    return errorResponse(err);
  }
}
