import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, notFound } from "@/lib/api/errors";
import { requireUser } from "@/lib/api/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const design = await prisma.design.findFirst({
      where: { id, status: "PUBLISHED" },
      include: {
        masterBoms: { orderBy: { version: "desc" }, take: 1, include: { lines: true } },
        templateParameters: { include: { permission: true } },
      },
    });
    if (!design) throw notFound(`Published template ${id} not found`);
    return NextResponse.json(design);
  } catch (err) {
    return errorResponse(err);
  }
}
