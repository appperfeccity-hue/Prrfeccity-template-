import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { autoFillPartition } from "@/lib/graph/geometry";
import { autoFillPartitionSchema } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; partitionId: string }> },
) {
  try {
    const { id, partitionId } = await params;
    await requireDraftDesign(id);
    const body = autoFillPartitionSchema.parse(await req.json());
    const result = await autoFillPartition(id, partitionId, body.skuId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
