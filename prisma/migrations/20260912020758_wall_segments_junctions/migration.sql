/*
  Warnings:

  - You are about to drop the column `wallId` on the `Zone` table. All the data in the column will be lost.
  - You are about to drop the `Wall` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Wall" DROP CONSTRAINT "Wall_id_fkey";

-- DropForeignKey
ALTER TABLE "Zone" DROP CONSTRAINT "Zone_wallId_fkey";

-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "wallSegmentId" TEXT;

-- AlterTable
ALTER TABLE "ProductInstance" ADD COLUMN     "wallSegmentId" TEXT;

-- AlterTable
ALTER TABLE "Zone" DROP COLUMN "wallId",
ADD COLUMN     "wallSegmentId" TEXT;

-- DropTable
DROP TABLE "Wall";

-- DropEnum
DROP TYPE "WallType";

-- CreateTable
CREATE TABLE "WallSegment" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "lengthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WallSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WallJunction" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "segmentAId" TEXT NOT NULL,
    "segmentBId" TEXT NOT NULL,
    "angleDeg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WallJunction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WallSegment_designId_sequence_key" ON "WallSegment"("designId", "sequence");

-- CreateIndex
CREATE INDEX "WallJunction_designId_idx" ON "WallJunction"("designId");

-- CreateIndex
CREATE UNIQUE INDEX "WallJunction_segmentAId_segmentBId_key" ON "WallJunction"("segmentAId", "segmentBId");

-- CreateIndex
CREATE INDEX "Fixture_wallSegmentId_idx" ON "Fixture"("wallSegmentId");

-- AddForeignKey
ALTER TABLE "WallSegment" ADD CONSTRAINT "WallSegment_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WallJunction" ADD CONSTRAINT "WallJunction_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WallJunction" ADD CONSTRAINT "WallJunction_segmentAId_fkey" FOREIGN KEY ("segmentAId") REFERENCES "WallSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WallJunction" ADD CONSTRAINT "WallJunction_segmentBId_fkey" FOREIGN KEY ("segmentBId") REFERENCES "WallSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_wallSegmentId_fkey" FOREIGN KEY ("wallSegmentId") REFERENCES "WallSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstance" ADD CONSTRAINT "ProductInstance_wallSegmentId_fkey" FOREIGN KEY ("wallSegmentId") REFERENCES "WallSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_wallSegmentId_fkey" FOREIGN KEY ("wallSegmentId") REFERENCES "WallSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
