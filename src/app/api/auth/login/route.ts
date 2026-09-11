import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { SESSION_COOKIE } from "@/lib/api/auth";
import { createSession, verifyLogin } from "@/lib/graph/auth";
import { loginSchema } from "@/lib/types";

// No guard -- this is how a session is obtained in the first place.
export async function POST(req: NextRequest) {
  try {
    const { email, password } = loginSchema.parse(await req.json());
    const user = await verifyLogin(email, password);
    const { token, expiresAt } = await createSession(user.id);

    const res = NextResponse.json(user);
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
