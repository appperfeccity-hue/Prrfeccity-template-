import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { createProductInstance } from "@/lib/graph/product";
import { createProductInstanceSchema } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const instances = await prisma.productInstance.findMany({
    where: { designId: id },
    include: { sku: true },
  });
  return NextResponse.json(instances);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireDraftDesign(id);
    const body = createProductInstanceSchema.parse(await req.json());
    const instance = await createProductInstance(id, body);
    return NextResponse.json(instance, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
