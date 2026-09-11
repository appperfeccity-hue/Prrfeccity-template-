import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { createProductInstanceEdge } from "@/lib/graph/product";
import { createProductInstanceEdgeSchema } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    await requireDraftDesign(id);
    const body = createProductInstanceEdgeSchema.parse(await req.json());
    const edge = await createProductInstanceEdge(id, body);
    return NextResponse.json(edge, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
