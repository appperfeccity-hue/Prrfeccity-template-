import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, notFound } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { requireProjectOwnerOrAdmin } from "@/lib/api/project-guards";
import { generateFinalBom } from "@/lib/graph/final-bom";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(req, ["ADMIN", "CONSULTANT"]);
    const { id } = await params;
    await requireProjectOwnerOrAdmin(id, user);
    const bom = await prisma.finalBom.findFirst({
      where: { projectId: id },
      orderBy: { version: "desc" },
      include: { lines: true },
    });
    if (!bom) throw notFound(`No Final BOM has been generated for project ${id}`);
    return NextResponse.json(bom);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(req, ["ADMIN", "CONSULTANT"]);
    const { id } = await params;
    await requireProjectOwnerOrAdmin(id, user);
    const bom = await generateFinalBom(id);
    return NextResponse.json(bom, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
