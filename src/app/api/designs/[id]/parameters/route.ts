import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createTemplateParameterSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const parameters = await prisma.templateParameter.findMany({
      where: { templateId: id },
      include: { permission: true },
    });
    return NextResponse.json(parameters);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id } = await params;
    await requireDraftDesign(id);
    const body = createTemplateParameterSchema.parse(await req.json());
    const parameter = await prisma.templateParameter.create({
      data: { templateId: id, ...body },
    });
    return NextResponse.json(parameter, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
