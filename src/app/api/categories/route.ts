import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireUser } from "@/lib/api/auth";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const categories = await prisma.category.findMany({ orderBy: { label: "asc" } });
    return NextResponse.json(categories);
  } catch (err) {
    return errorResponse(err);
  }
}
