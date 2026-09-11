import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { requireDraftDesign } from "@/lib/api/guards";
import { requireRole } from "@/lib/api/auth";
import { setConsultantPermissionSchema } from "@/lib/types";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paramId: string }> },
) {
  try {
    await requireRole(req, ["ADMIN", "DESIGNER"]);
    const { id, paramId } = await params;
    await requireDraftDesign(id);
    const body = setConsultantPermissionSchema.parse(await req.json());
    const permission = await prisma.consultantPermission.upsert({
      where: { templateParameterId: paramId },
      create: { templateParameterId: paramId, ...body },
      update: body,
    });
    return NextResponse.json(permission);
  } catch (err) {
    return errorResponse(err);
  }
}
