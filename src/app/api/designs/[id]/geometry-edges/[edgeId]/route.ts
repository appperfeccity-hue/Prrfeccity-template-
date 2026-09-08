import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { updateEdgeFlagsSchema } from "@/lib/types";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; edgeId: string }> },
) {
  try {
    const { id, edgeId } = await params;
    await requireDraftDesign(id);
    const body = updateEdgeFlagsSchema.parse(await req.json());
    const edge = await prisma.geometryEdge.update({
      where: { id: edgeId },
      data: body,
    });
    return NextResponse.json(edge);
  } catch (err) {
    return errorResponse(err);
  }
}
