import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const published = await prisma.design.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });

  const latestByLineage = new Map<string, (typeof published)[number]>();
  for (const design of published) {
    const lineageKey = design.rootTemplateId ?? design.id;
    if (!latestByLineage.has(lineageKey)) {
      latestByLineage.set(lineageKey, design);
    }
  }

  return NextResponse.json(
    [...latestByLineage.values()].sort(
      (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    ),
  );
}
