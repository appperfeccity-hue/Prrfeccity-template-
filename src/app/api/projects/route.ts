import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { createProjectFromTemplate } from "@/lib/graph/project";
import { createProjectSchema } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "CONSULTANT"]);
    const projects = await prisma.project.findMany({
      where: user.role === "ADMIN" ? undefined : { createdByUserId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { template: true },
    });
    return NextResponse.json(projects);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "CONSULTANT"]);
    const body = createProjectSchema.parse(await req.json());
    const project = await createProjectFromTemplate(body.templateId, body.name, user.id);
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
