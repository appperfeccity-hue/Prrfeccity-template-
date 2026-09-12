import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { updateWallJunctionAngle } from "@/lib/graph/geometry";
import { updateWallJunctionSchema } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; junctionId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, junctionId } = await params;
    await requireDraftDesign(id);
    const body = updateWallJunctionSchema.parse(await req.json());
    const junction = await updateWallJunctionAngle(junctionId, body.angleDeg);
    return NextResponse.json(junction);
  } catch (err) {
    return errorResponse(err);
  }
}
