import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDesign } from "@/lib/api/guards";
import { validateDesign } from "@/lib/graph/validation";

// Read-only, non-persisting live preview -- unlike POST /validate, this never
// writes a DesignValidationResult row. Harmless post-publish too, so it only
// needs requireDesign (existence), not requireDraftDesign.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireDesign(id);
    const issues = await validateDesign(id);
    const passed = !issues.some((i) => i.severity === "ERROR");
    return NextResponse.json({ issues, passed });
  } catch (err) {
    return errorResponse(err);
  }
}
