import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { createWall } from "@/lib/graph/geometry";
import { setWallSchema } from "@/lib/types";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireDraftDesign(id);
    const body = setWallSchema.parse(await req.json());
    if (body.wallType === "L_TYPE" && body.cornerAngleDeg === undefined) {
      body.cornerAngleDeg = 90;
    }
    const result = await createWall(id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
