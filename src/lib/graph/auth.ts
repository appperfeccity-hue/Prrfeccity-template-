import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { badRequest, unauthorized } from "@/lib/api/errors";
import type { Role } from "@/generated/prisma/client";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A safe user shape for API responses -- never includes passwordHash.
export type SafeUser = { id: string; email: string; name: string; role: Role; createdAt: Date };

function toSafeUser(user: { id: string; email: string; name: string; role: Role; createdAt: Date }): SafeUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
}): Promise<SafeUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw badRequest(`A user with email ${input.email} already exists`);

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash, name: input.name, role: input.role },
  });
  return toSafeUser(user);
}

export async function listUsers(): Promise<SafeUser[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map(toSafeUser);
}

// Deliberately the same error/status for "no such user" and "wrong password"
// -- never let a caller distinguish the two, that's a user-enumeration leak.
export async function verifyLogin(email: string, password: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw unauthorized("Invalid email or password");
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw unauthorized("Invalid email or password");
  return toSafeUser(user);
}
