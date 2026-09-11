import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paramId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, paramId } = await params;
    await requireDraftDesign(id);
    await prisma.templateParameter.delete({ where: { id: paramId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
