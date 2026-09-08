-- CreateEnum
CREATE TYPE "LibraryRoomType" AS ENUM ('LIVING_ROOM', 'TV_UNIT', 'BEDROOM');

-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "areaSqFt" DOUBLE PRECISION,
ADD COLUMN     "isFavorited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "libraryRoomType" "LibraryRoomType",
ADD COLUMN     "lookId" TEXT,
ADD COLUMN     "pricePerSqFt" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Look" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "swatchColor" TEXT NOT NULL,

    CONSTRAINT "Look_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Look_key_key" ON "Look"("key");

-- CreateIndex
CREATE INDEX "Design_lookId_idx" ON "Design"("lookId");

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_lookId_fkey" FOREIGN KEY ("lookId") REFERENCES "Look"("id") ON DELETE SET NULL ON UPDATE CASCADE;
