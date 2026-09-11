import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { deleteProductInstanceEdge } from "@/lib/graph/product";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; edgeId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, edgeId } = await params;
    await requireDraftDesign(id);
    await deleteProductInstanceEdge(edgeId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
