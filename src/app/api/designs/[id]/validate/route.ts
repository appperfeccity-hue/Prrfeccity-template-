import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { runAndPersistValidation } from "@/lib/graph/validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    await requireDesign(id);
    const { result } = await runAndPersistValidation(id);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
