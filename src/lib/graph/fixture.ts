import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api/errors";
import type { FixtureType } from "@/generated/prisma/client";

export async function createFixture(
  designId: string,
  input: {
    fixtureType: FixtureType;
    label?: string | null;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    clearanceMm?: number;
  },
) {
  return prisma.fixture.create({
    data: {
      designId,
      fixtureType: input.fixtureType,
      label: input.label ?? null,
      xMm: input.xMm,
      yMm: input.yMm,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      clearanceMm: input.clearanceMm ?? 0,
    },
  });
}

export async function updateFixture(
  fixtureId: string,
  input: Partial<{
    fixtureType: FixtureType;
    label: string | null;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    clearanceMm: number;
  }>,
) {
  const existing = await prisma.fixture.findUnique({ where: { id: fixtureId } });
  if (!existing) throw notFound(`Fixture ${fixtureId} not found`);
  return prisma.fixture.update({ where: { id: fixtureId }, data: input });
}

export async function deleteFixture(fixtureId: string) {
  await prisma.fixture.delete({ where: { id: fixtureId } });
}
