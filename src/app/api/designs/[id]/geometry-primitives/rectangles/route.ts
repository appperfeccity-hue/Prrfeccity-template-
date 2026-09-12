import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createGeometryPrimitiveRectangle } from "@/lib/graph/geometry";
import { createGeometryPrimitiveRectangleSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const rectangles = await prisma.geometryPrimitiveRectangle.findMany({ where: { designId: id } });
    return NextResponse.json(rectangles);
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
    const body = createGeometryPrimitiveRectangleSchema.parse(await req.json());
    const rectangle = await createGeometryPrimitiveRectangle(id, body);
    return NextResponse.json(rectangle, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
