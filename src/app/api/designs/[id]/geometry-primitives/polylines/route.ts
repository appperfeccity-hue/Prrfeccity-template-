import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createGeometryPrimitivePolyline } from "@/lib/graph/geometry";
import { createGeometryPrimitivePolylineSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const polylines = await prisma.geometryPrimitivePolyline.findMany({
      where: { designId: id },
      include: { points: { orderBy: { sequenceIndex: "asc" } } },
    });
    return NextResponse.json(polylines);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    await requireDraftDesign(id);
    const body = createGeometryPrimitivePolylineSchema.parse(await req.json());
    const polyline = await createGeometryPrimitivePolyline(id, body);
    return NextResponse.json(polyline, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
