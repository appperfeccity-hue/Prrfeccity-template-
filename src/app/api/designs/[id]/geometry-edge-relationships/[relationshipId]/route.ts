import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { deleteGeometryEdgeRelationship } from "@/lib/graph/geometry";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; relationshipId: string }> },
) {
  try {
    const { id, relationshipId } = await params;
    await requireDraftDesign(id);
    await deleteGeometryEdgeRelationship(relationshipId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
