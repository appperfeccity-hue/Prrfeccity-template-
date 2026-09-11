import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireRole, requireUser } from "@/lib/api/auth";
import { createDesignSchema } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const designs = await prisma.design.findMany({ orderBy: { updatedAt: "desc" } });
    return NextResponse.json(designs);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const body = createDesignSchema.parse(await req.json());
    const design = await prisma.design.create({
      data: {
        name: body.name,
        description: body.description,
        tags: body.tags ?? [],
      },
    });
    return NextResponse.json(design, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
