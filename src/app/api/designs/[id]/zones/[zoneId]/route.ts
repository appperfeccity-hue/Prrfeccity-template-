import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { deleteGeometryNode } from "@/lib/graph/geometry";
import { updateZoneSchema } from "@/lib/types";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; zoneId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, zoneId } = await params;
    await requireDraftDesign(id);
    const body = updateZoneSchema.parse(await req.json());
    const zone = await prisma.zone.update({
      where: { id: zoneId },
      data: body,
    });
    return NextResponse.json(zone);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; zoneId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, zoneId } = await params;
    await requireDraftDesign(id);
    await deleteGeometryNode(zoneId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
