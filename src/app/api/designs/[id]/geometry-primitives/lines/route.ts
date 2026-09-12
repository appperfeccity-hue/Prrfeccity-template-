import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createGeometryPrimitiveLine } from "@/lib/graph/geometry";
import { createGeometryPrimitiveLineSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const lines = await prisma.geometryPrimitiveLine.findMany({ where: { designId: id } });
    return NextResponse.json(lines);
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
    const body = createGeometryPrimitiveLineSchema.parse(await req.json());
    const line = await createGeometryPrimitiveLine(id, body);
    return NextResponse.json(line, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
