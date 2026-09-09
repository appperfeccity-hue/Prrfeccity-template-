import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  const skus = await prisma.skuMaster.findMany({
    where: category ? { category: { key: category } } : undefined,
    include: { category: true, designOptions: true, colourOptions: true, sizeOptions: true },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(skus);
}
