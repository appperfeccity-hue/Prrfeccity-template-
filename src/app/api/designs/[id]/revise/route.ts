import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { reviseTemplate } from "@/lib/graph/revise";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const child = await reviseTemplate(id);
    return NextResponse.json(child, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
