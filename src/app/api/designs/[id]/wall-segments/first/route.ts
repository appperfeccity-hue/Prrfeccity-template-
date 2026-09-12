import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { createWallSegment } from "@/lib/graph/geometry";
import { createWallSegmentSchema } from "@/lib/types";

// Creates-or-replaces the design's first (sequence 0) wall segment -- the
// same create-or-replace semantics the old singular PUT /wall route had.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    await requireDraftDesign(id);
    const body = createWallSegmentSchema.parse(await req.json());
    const result = await createWallSegment(id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
