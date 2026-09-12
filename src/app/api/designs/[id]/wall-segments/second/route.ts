import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { addWallSegment } from "@/lib/graph/geometry";
import { addWallSegmentSchema } from "@/lib/types";

// Appends the design's second segment PLUS the junction connecting it to
// segment 0, in one call -- a junction is meaningless without both
// endpoints. Literal "second" path (rather than a generic append endpoint)
// matches the exact-cap-of-2-segments shape this pass enforces.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    await requireDraftDesign(id);
    const body = addWallSegmentSchema.parse(await req.json());
    const result = await addWallSegment(id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
