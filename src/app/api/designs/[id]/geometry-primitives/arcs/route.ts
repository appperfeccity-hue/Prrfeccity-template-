import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createGeometryPrimitiveArc } from "@/lib/graph/geometry";
import { createGeometryPrimitiveArcSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const arcs = await prisma.geometryPrimitiveArc.findMany({ where: { designId: id } });
    return NextResponse.json(arcs);
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
    const body = createGeometryPrimitiveArcSchema.parse(await req.json());
    const arc = await createGeometryPrimitiveArc(id, body);
    return NextResponse.json(arc, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
