import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/api/errors";
import type { User } from "@/generated/prisma/client";

export async function requireProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound(`Project ${projectId} not found`);
  return project;
}

// The first ownership-aware guard in this codebase -- every other guard
// (requireDraftDesign/requireDesign in src/lib/api/guards.ts) checks only
// row *state*, never row *ownership*. Consultant Projects are the first
// resource where "who created it" is itself part of the authorization
// contract: a Consultant may only access Projects they created; Admin
// bypasses this check entirely (matches every other Admin-can-do-anything
// precedent in this app's role model).
export async function requireProjectOwnerOrAdmin(projectId: string, user: Pick<User, "id" | "role">) {
  const project = await requireProject(projectId);
  if (user.role !== "ADMIN" && project.createdByUserId !== user.id) {
    throw forbidden("You can only access Projects you created");
  }
  return project;
}
