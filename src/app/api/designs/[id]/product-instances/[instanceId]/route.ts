import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { deleteProductInstance, updateProductInstance } from "@/lib/graph/product";
import { updateProductInstanceSchema } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> },
) {
  try {
    const { id, instanceId } = await params;
    await requireDraftDesign(id);
    const body = updateProductInstanceSchema.parse(await req.json());
    const instance = await updateProductInstance(instanceId, body);
    return NextResponse.json(instance);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> },
) {
  try {
    const { id, instanceId } = await params;
    await requireDraftDesign(id);
    await deleteProductInstance(instanceId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
