import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createGeometryPrimitiveCircle } from "@/lib/graph/geometry";
import { createGeometryPrimitiveCircleSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const circles = await prisma.geometryPrimitiveCircle.findMany({ where: { designId: id } });
    return NextResponse.json(circles);
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
    const body = createGeometryPrimitiveCircleSchema.parse(await req.json());
    const circle = await createGeometryPrimitiveCircle(id, body);
    return NextResponse.json(circle, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
