import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidden, unauthorized } from "@/lib/api/errors";
import type { Role, User } from "@/generated/prisma/client";

export const SESSION_COOKIE = "session";

/**
 * Auth: resolves the session cookie into a User row. This is the one place
 * a route reads "who is calling" -- composes with requireDraftDesign/
 * requireDesign (src/lib/api/guards.ts) exactly the way those already
 * compose with each other: one more `await require...()` line at the same
 * position, not a different mechanism.
 */
export async function requireUser(req: NextRequest): Promise<User> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw unauthorized("Not signed in");

  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) {
    throw unauthorized("Session expired or invalid");
  }
  return session.user;
}

/**
 * Role Authorization: the one centralized place role checks live, called at
 * ~30 route call sites -- the centralization is in the logic (this function),
 * not in each call site duplicating a role comparison.
 */
export async function requireRole(req: NextRequest, allowedRoles: Role[]): Promise<User> {
  const user = await requireUser(req);
  if (!allowedRoles.includes(user.role)) {
    throw forbidden(`This action requires one of: ${allowedRoles.join(", ")}`);
  }
  return user;
}
