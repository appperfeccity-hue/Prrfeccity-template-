import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { discontinueSkuMaster } from "@/lib/graph/sku";

// A dedicated action route (mirrors POST /api/designs/:id/publish) rather
// than a PATCH body flag -- discontinuation is a lifecycle status
// transition, not a catalog field edit.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN"]);
    const { id } = await params;
    const sku = await discontinueSkuMaster(id);
    return NextResponse.json(sku);
  } catch (err) {
    return errorResponse(err);
  }
}
