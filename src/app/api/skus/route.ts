import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SkuCategory } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") as SkuCategory | null;
  const skus = await prisma.skuMaster.findMany({
    where: category ? { category } : undefined,
    orderBy: { code: "asc" },
  });
  return NextResponse.json(skus);
}
