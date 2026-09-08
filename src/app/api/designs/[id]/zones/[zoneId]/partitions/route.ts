import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { createPartition } from "@/lib/graph/geometry";
import { createPartitionSchema } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; zoneId: string }> },
) {
  try {
    const { id, zoneId } = await params;
    await requireDraftDesign(id);
    const body = createPartitionSchema.parse(await req.json());
    const partition = await createPartition(id, zoneId, body);
    return NextResponse.json(partition, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
