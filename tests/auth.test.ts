import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  createUser,
  deleteSession,
  hashPassword,
  verifyLogin,
  verifyPassword,
} from "@/lib/graph/auth";
import { requireRole, requireUser } from "@/lib/api/auth";
import type { Role } from "@/generated/prisma/client";

let userIdToCleanUp: string | undefined;

afterEach(async () => {
  if (userIdToCleanUp) {
    await prisma.session.deleteMany({ where: { userId: userIdToCleanUp } });
    await prisma.user.delete({ where: { id: userIdToCleanUp } });
    userIdToCleanUp = undefined;
  }
});

function reqWithToken(token?: string) {
  return new NextRequest("http://localhost/api/test", {
    headers: token ? { cookie: `session=${token}` } : undefined,
  });
}

async function makeUser(role: Role, emailSuffix: string) {
  const user = await createUser({
    email: `auth-test-${emailSuffix}@example.com`,
    password: "correct-horse-battery-staple",
    name: `Test ${role}`,
    role,
  });
  userIdToCleanUp = user.id;
  return user;
}

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password through the hash", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("createSession / deleteSession", () => {
  it("persists a session row that resolves back to the user, and deleteSession removes it", async () => {
    const user = await makeUser("DESIGNER", "session-crud");
    const { token, expiresAt } = await createSession(user.id);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const found = await prisma.session.findUnique({ where: { token } });
    expect(found?.userId).toBe(user.id);

    await deleteSession(token);
    const afterDelete = await prisma.session.findUnique({ where: { token } });
    expect(afterDelete).toBeNull();
  });

  it("respects expiresAt -- requireUser rejects an expired session", async () => {
    const user = await makeUser("DESIGNER", "session-expired");
    const { token } = await createSession(user.id);
    await prisma.session.update({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(requireUser(reqWithToken(token))).rejects.toMatchObject({ status: 401 });
  });
});

describe("verifyLogin", () => {
  it("returns the safe user shape on a correct password", async () => {
    const user = await makeUser("ADMIN", "login-ok");
    const result = await verifyLogin(user.email, "correct-horse-battery-staple");
    expect(result.id).toBe(user.id);
    expect((result as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it("rejects a wrong password with 401, not a distinguishable error", async () => {
    const user = await makeUser("ADMIN", "login-wrong-password");
    await expect(verifyLogin(user.email, "not-the-password")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a nonexistent email with the same 401 -- no user-enumeration leak", async () => {
    await expect(verifyLogin("nobody-at-all@example.com", "whatever")).rejects.toMatchObject({ status: 401 });
  });
});

describe("requireUser", () => {
  it("resolves a valid session to its User row", async () => {
    const user = await makeUser("CONSULTANT", "require-user-ok");
    const { token } = await createSession(user.id);

    const result = await requireUser(reqWithToken(token));
    expect(result.id).toBe(user.id);
  });

  it("401s when no session cookie is present", async () => {
    await expect(requireUser(reqWithToken())).rejects.toMatchObject({ status: 401 });
  });

  it("401s on a garbage/unknown token", async () => {
    await expect(requireUser(reqWithToken("not-a-real-token"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("requireRole", () => {
  it("passes through when the resolved user's role is in the allowed list", async () => {
    const user = await makeUser("ADMIN", "require-role-ok");
    const { token } = await createSession(user.id);

    const result = await requireRole(reqWithToken(token), ["ADMIN", "DESIGNER"]);
    expect(result.id).toBe(user.id);
  });

  it("403s when the resolved user's role is not in the allowed list", async () => {
    const user = await makeUser("CONSULTANT", "require-role-forbidden");
    const { token } = await createSession(user.id);

    await expect(requireRole(reqWithToken(token), ["ADMIN", "DESIGNER"])).rejects.toMatchObject({ status: 403 });
  });

  it("401s (not 403) when there's no session at all -- auth is checked before role", async () => {
    await expect(requireRole(reqWithToken(), ["ADMIN"])).rejects.toMatchObject({ status: 401 });
  });

  it.each<Role>(["ADMIN", "DESIGNER", "CONSULTANT", "SYSTEM"])(
    "exhaustively covers every Role value against a representative allowed-list (%s)",
    async (role) => {
      const user = await makeUser(role, `require-role-exhaustive-${role.toLowerCase()}`);
      const { token } = await createSession(user.id);

      if (role === "ADMIN" || role === "DESIGNER") {
        const result = await requireRole(reqWithToken(token), ["ADMIN", "DESIGNER"]);
        expect(result.role).toBe(role);
      } else {
        await expect(requireRole(reqWithToken(token), ["ADMIN", "DESIGNER"])).rejects.toMatchObject({ status: 403 });
      }
    },
  );
});
