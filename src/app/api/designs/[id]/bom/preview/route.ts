import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDesign } from "@/lib/api/guards";
import { requireUser } from "@/lib/api/auth";
import { computeMasterBomLines } from "@/lib/graph/bom";

// Read-only, non-persisting live preview -- unlike POST /bom, this never
// creates a MasterBom/MasterBomLine row and doesn't gate on the latest
// validation result, so it can show what the BOM would contain mid-edit.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    await requireDesign(id);
    const lines = await computeMasterBomLines(id);
    return NextResponse.json({ lines });
  } catch (err) {
    return errorResponse(err);
  }
}
