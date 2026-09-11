import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { requireProjectOwnerOrAdmin } from "@/lib/api/project-guards";
import { setProjectEdgeTreatment } from "@/lib/graph/project";
import { setProjectEdgeTreatmentSchema } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; edgeId: string }> },
) {
  try {
    const user = await requireRole(req, ["ADMIN", "CONSULTANT"]);
    const { id, edgeId } = await params;
    await requireProjectOwnerOrAdmin(id, user);
    const body = setProjectEdgeTreatmentSchema.parse(await req.json());
    const relationship = await setProjectEdgeTreatment(id, edgeId, body.skuId);
    return NextResponse.json(relationship);
  } catch (err) {
    return errorResponse(err);
  }
}
