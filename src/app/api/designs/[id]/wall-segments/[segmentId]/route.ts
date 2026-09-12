import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { deleteWallSegment, updateWallSegmentDimensions } from "@/lib/graph/geometry";
import { updateWallSegmentSchema } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, segmentId } = await params;
    await requireDraftDesign(id);
    const body = updateWallSegmentSchema.parse(await req.json());
    const segment = await updateWallSegmentDimensions(segmentId, body);
    return NextResponse.json(segment);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; segmentId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, segmentId } = await params;
    await requireDraftDesign(id);
    await deleteWallSegment(id, segmentId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
