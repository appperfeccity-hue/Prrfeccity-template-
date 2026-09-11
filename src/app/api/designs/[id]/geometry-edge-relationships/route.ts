import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { createGeometryEdgeRelationship } from "@/lib/graph/geometry";
import { createGeometryEdgeRelationshipSchema } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    await requireDraftDesign(id);
    const body = createGeometryEdgeRelationshipSchema.parse(await req.json());
    const relationship = await createGeometryEdgeRelationship(id, body);
    return NextResponse.json(relationship, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
