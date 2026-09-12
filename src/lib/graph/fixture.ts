import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api/errors";
import { resolveWallSegmentId } from "@/lib/graph/geometry";
import type { FixtureType } from "@/generated/prisma/client";

export async function createFixture(
  designId: string,
  input: {
    fixtureType: FixtureType;
    label?: string | null;
    wallSegmentId?: string | null;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    clearanceMm?: number;
  },
) {
  const wallSegmentId = await resolveWallSegmentId(designId, input.wallSegmentId);
  return prisma.fixture.create({
    data: {
      designId,
      fixtureType: input.fixtureType,
      label: input.label ?? null,
      wallSegmentId,
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
    wallSegmentId: string | null;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
    clearanceMm: number;
  }>,
) {
  const existing = await prisma.fixture.findUnique({ where: { id: fixtureId } });
  if (!existing) throw notFound(`Fixture ${fixtureId} not found`);
  const data = { ...input };
  if (input.wallSegmentId !== undefined) {
    data.wallSegmentId = await resolveWallSegmentId(existing.designId, input.wallSegmentId);
  }
  return prisma.fixture.update({ where: { id: fixtureId }, data });
}

export async function deleteFixture(fixtureId: string) {
  await prisma.fixture.delete({ where: { id: fixtureId } });
}
