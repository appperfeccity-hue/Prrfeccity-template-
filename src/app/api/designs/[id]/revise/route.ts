import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { reviseTemplate } from "@/lib/graph/revise";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    const child = await reviseTemplate(id);
    return NextResponse.json(child, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
