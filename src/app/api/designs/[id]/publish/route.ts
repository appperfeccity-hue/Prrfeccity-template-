import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { publishTemplate } from "@/lib/graph/publish";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireDraftDesign(id);
    const design = await publishTemplate(id);
    return NextResponse.json(design);
  } catch (err) {
    return errorResponse(err);
  }
}
