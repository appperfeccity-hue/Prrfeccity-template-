import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { deleteFixture, updateFixture } from "@/lib/graph/fixture";
import { updateFixtureSchema } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, fixtureId } = await params;
    await requireDraftDesign(id);
    const body = updateFixtureSchema.parse(await req.json());
    const fixture = await updateFixture(fixtureId, body);
    return NextResponse.json(fixture);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, fixtureId } = await params;
    await requireDraftDesign(id);
    await deleteFixture(fixtureId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
