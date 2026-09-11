import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createZone } from "@/lib/graph/geometry";
import { createZoneSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const zones = await prisma.zone.findMany({
      where: { designId: id },
      orderBy: { orderIndex: "asc" },
    });
    return NextResponse.json(zones);
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
    const body = createZoneSchema.parse(await req.json());
    const result = await createZone(id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
