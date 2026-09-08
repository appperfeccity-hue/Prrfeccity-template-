import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { createGeometryProductRelationship } from "@/lib/graph/product";
import { createGeometryProductRelationshipSchema } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireDraftDesign(id);
    const body = createGeometryProductRelationshipSchema.parse(await req.json());
    const relationship = await createGeometryProductRelationship(id, body);
    return NextResponse.json(relationship, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
