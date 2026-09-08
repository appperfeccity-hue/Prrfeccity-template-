import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, notFound } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { generateMasterBom } from "@/lib/graph/bom";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const bom = await prisma.masterBom.findFirst({
      where: { templateId: id },
      orderBy: { version: "desc" },
      include: { lines: true },
    });
    if (!bom) throw notFound(`No Master BOM has been generated for design ${id}`);
    return NextResponse.json(bom);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireDraftDesign(id);
    const bom = await generateMasterBom(id);
    return NextResponse.json(bom, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
