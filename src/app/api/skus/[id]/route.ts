import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, notFound } from "@/lib/api/errors";
import { requireRole, requireUser } from "@/lib/api/auth";
import { updateSkuMaster } from "@/lib/graph/sku";
import { updateSkuMasterSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const sku = await prisma.skuMaster.findUnique({
      where: { id },
      include: {
        category: true,
        edgesFrom: { include: { toSku: true } },
        edgesTo: { include: { fromSku: true } },
        designOptions: true,
        colourOptions: true,
        sizeOptions: true,
      },
    });
    if (!sku) throw notFound(`SKU ${id} not found`);
    return NextResponse.json(sku);
  } catch (err) {
    return errorResponse(err);
  }
}

// Catalog editing -- unlike Design mutations, not gated by draft/published
// status (SkuMaster isn't a Design at all). Physical/rule field changes
// bump currentVersion + freeze a new SkuMasterVersion snapshot; cosmetic
// code/name edits don't. See src/lib/graph/sku.ts.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN"]);
    const { id } = await params;
    const body = updateSkuMasterSchema.parse(await req.json());
    const sku = await updateSkuMaster(id, body);
    return NextResponse.json(sku);
  } catch (err) {
    return errorResponse(err);
  }
}
