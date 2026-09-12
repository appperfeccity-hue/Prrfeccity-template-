import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createConstraint } from "@/lib/graph/constraint";
import { createConstraintSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const constraints = await prisma.constraint.findMany({ where: { designId: id } });
    return NextResponse.json(constraints);
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
    const body = createConstraintSchema.parse(await req.json());
    const constraint = await createConstraint(id, body);
    return NextResponse.json(constraint, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
