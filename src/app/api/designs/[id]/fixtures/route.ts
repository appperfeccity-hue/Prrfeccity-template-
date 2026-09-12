import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createFixture } from "@/lib/graph/fixture";
import { createFixtureSchema } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(req);
    const { id } = await params;
    const fixtures = await prisma.fixture.findMany({ where: { designId: id } });
    return NextResponse.json(fixtures);
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
    const body = createFixtureSchema.parse(await req.json());
    const fixture = await createFixture(id, body);
    return NextResponse.json(fixture, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
