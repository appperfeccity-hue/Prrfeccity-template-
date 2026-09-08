import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paramId: string }> },
) {
  try {
    const { id, paramId } = await params;
    await requireDraftDesign(id);
    await prisma.templateParameter.delete({ where: { id: paramId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
