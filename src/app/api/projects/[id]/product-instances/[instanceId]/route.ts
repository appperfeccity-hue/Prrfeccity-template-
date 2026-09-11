import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { requireProjectOwnerOrAdmin } from "@/lib/api/project-guards";
import { updateProjectProductInstance } from "@/lib/graph/project";
import { updateProjectProductInstanceSchema } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> },
) {
  try {
    const user = await requireRole(req, ["ADMIN", "CONSULTANT"]);
    const { id, instanceId } = await params;
    await requireProjectOwnerOrAdmin(id, user);
    const body = updateProjectProductInstanceSchema.parse(await req.json());
    const instance = await updateProjectProductInstance(id, instanceId, body);
    return NextResponse.json(instance);
  } catch (err) {
    return errorResponse(err);
  }
}
