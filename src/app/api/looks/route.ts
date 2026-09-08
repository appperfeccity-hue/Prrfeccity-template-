import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const looks = await prisma.look.findMany({ orderBy: { label: "asc" } });
  return NextResponse.json(looks);
}
