import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireRole } from "@/lib/api/auth";
import { createUser, listUsers } from "@/lib/graph/auth";
import { createUserSchema } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const users = await listUsers();
    return NextResponse.json(users);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["ADMIN"]);
    const body = createUserSchema.parse(await req.json());
    const user = await createUser(body);
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
