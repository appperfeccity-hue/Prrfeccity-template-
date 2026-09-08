import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { updatePanel } from "@/lib/graph/geometry";
import { updatePanelSchema } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; panelId: string }> },
) {
  try {
    const { id, panelId } = await params;
    await requireDraftDesign(id);
    const body = updatePanelSchema.parse(await req.json());
    const panel = await updatePanel(panelId, body);
    return NextResponse.json(panel);
  } catch (err) {
    return errorResponse(err);
  }
}
