import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDesign } from "@/lib/api/guards";
import { runAndPersistValidation } from "@/lib/graph/validation";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireDesign(id);
    const { result } = await runAndPersistValidation(id);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
