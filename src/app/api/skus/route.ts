import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireUser } from "@/lib/api/auth";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const category = req.nextUrl.searchParams.get("category");
    const skus = await prisma.skuMaster.findMany({
      where: category ? { category: { key: category } } : undefined,
      include: { category: true, designOptions: true, colourOptions: true, sizeOptions: true },
      orderBy: { code: "asc" },
    });
    return NextResponse.json(skus);
  } catch (err) {
    return errorResponse(err);
  }
}
