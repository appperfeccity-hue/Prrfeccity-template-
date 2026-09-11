import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createUser } from "@/lib/graph/auth";
import { requireProject, requireProjectOwnerOrAdmin } from "@/lib/api/project-guards";
import type { Role } from "@/generated/prisma/client";

let designIdToCleanUp: string | undefined;
let userIdsToCleanUp: string[] = [];

afterEach(async () => {
  if (designIdToCleanUp) {
    // Project.templateId has no onDelete: Cascade (a deliberate design
    // decision -- Project business data must not be silently destroyed if a
    // future pass ever adds Design deletion), so Projects must be removed
    // before their template Design.
    await prisma.project.deleteMany({ where: { templateId: designIdToCleanUp } });
    await prisma.design.delete({ where: { id: designIdToCleanUp } });
    designIdToCleanUp = undefined;
  }
  for (const id of userIdsToCleanUp) {
    await prisma.user.delete({ where: { id } });
  }
  userIdsToCleanUp = [];
});

async function makeUser(role: Role, emailSuffix: string) {
  const user = await createUser({
    email: `project-guards-test-${emailSuffix}-${Date.now()}@example.com`,
    password: "correct-horse-battery-staple",
    name: `Test ${role}`,
    role,
  });
  userIdsToCleanUp.push(user.id);
  return user;
}

describe("requireProject", () => {
  it("returns the project when it exists", async () => {
    const design = await prisma.design.create({ data: { name: "Project Guards Fixture Template" } });
    designIdToCleanUp = design.id;
    const owner = await makeUser("CONSULTANT", "owner");
    const project = await prisma.project.create({
      data: { name: "Fixture Project", templateId: design.id, createdByUserId: owner.id },
    });

    const result = await requireProject(project.id);
    expect(result.id).toBe(project.id);
  });

  it("throws not-found for a nonexistent project", async () => {
    await expect(requireProject("does-not-exist")).rejects.toMatchObject({ status: 404 });
  });
});

describe("requireProjectOwnerOrAdmin -- the first ownership-aware guard in this codebase", () => {
  it("passes for the Consultant who created the project", async () => {
    const design = await prisma.design.create({ data: { name: "Project Guards Fixture Template 2" } });
    designIdToCleanUp = design.id;
    const owner = await makeUser("CONSULTANT", "creator");
    const project = await prisma.project.create({
      data: { name: "Owned Project", templateId: design.id, createdByUserId: owner.id },
    });

    const result = await requireProjectOwnerOrAdmin(project.id, owner);
    expect(result.id).toBe(project.id);
  });

  it("passes for any ADMIN regardless of who created the project", async () => {
    const design = await prisma.design.create({ data: { name: "Project Guards Fixture Template 3" } });
    designIdToCleanUp = design.id;
    const owner = await makeUser("CONSULTANT", "creator2");
    const admin = await makeUser("ADMIN", "admin-bypass");
    const project = await prisma.project.create({
      data: { name: "Admin Bypass Project", templateId: design.id, createdByUserId: owner.id },
    });

    const result = await requireProjectOwnerOrAdmin(project.id, admin);
    expect(result.id).toBe(project.id);
  });

  it("403s for a different Consultant who did not create the project", async () => {
    const design = await prisma.design.create({ data: { name: "Project Guards Fixture Template 4" } });
    designIdToCleanUp = design.id;
    const owner = await makeUser("CONSULTANT", "creator3");
    const otherConsultant = await makeUser("CONSULTANT", "not-the-owner");
    const project = await prisma.project.create({
      data: { name: "Someone Else's Project", templateId: design.id, createdByUserId: owner.id },
    });

    await expect(requireProjectOwnerOrAdmin(project.id, otherConsultant)).rejects.toMatchObject({ status: 403 });
  });

  it("404s for a nonexistent project regardless of caller", async () => {
    const admin = await makeUser("ADMIN", "admin-404");
    await expect(requireProjectOwnerOrAdmin("does-not-exist", admin)).rejects.toMatchObject({ status: 404 });
  });
});
