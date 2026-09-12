-- CreateEnum
CREATE TYPE "FixtureType" AS ENUM ('TV', 'AC_UNIT', 'ELECTRICAL_SOCKET', 'WINDOW', 'DOOR');

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "fixtureType" "FixtureType" NOT NULL,
    "label" TEXT,
    "xMm" DOUBLE PRECISION NOT NULL,
    "yMm" DOUBLE PRECISION NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "clearanceMm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fixture_designId_idx" ON "Fixture"("designId");

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
