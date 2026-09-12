import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { deleteConstraint } from "@/lib/graph/constraint";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; constraintId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, constraintId } = await params;
    await requireDraftDesign(id);
    await deleteConstraint(constraintId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
