import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { requireUser, SESSION_COOKIE } from "@/lib/api/auth";
import { deleteSession } from "@/lib/graph/auth";

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) await deleteSession(token);

    const res = new NextResponse(null, { status: 204 });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
