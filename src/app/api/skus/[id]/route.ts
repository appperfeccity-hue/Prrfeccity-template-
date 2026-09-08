import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, notFound } from "@/lib/api/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sku = await prisma.skuMaster.findUnique({
      where: { id },
      include: {
        edgesFrom: { include: { toSku: true } },
        edgesTo: { include: { fromSku: true } },
      },
    });
    if (!sku) throw notFound(`SKU ${id} not found`);
    return NextResponse.json(sku);
  } catch (err) {
    return errorResponse(err);
  }
}
