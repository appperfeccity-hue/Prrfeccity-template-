-- AlterTable
ALTER TABLE "MasterBomLine" ADD COLUMN     "skuVersionId" TEXT;

-- AlterTable
ALTER TABLE "SkuMaster" ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "discontinuedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SkuMasterVersion" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "defaultWidthMm" DOUBLE PRECISION,
    "defaultUnit" TEXT NOT NULL,
    "minCutPieceMm" DOUBLE PRECISION,
    "attributes" JSONB,
    "rotatable" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuMasterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkuMasterVersion_skuId_version_key" ON "SkuMasterVersion"("skuId", "version");

-- AddForeignKey
ALTER TABLE "SkuMasterVersion" ADD CONSTRAINT "SkuMasterVersion_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SkuMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuMasterVersion" ADD CONSTRAINT "SkuMasterVersion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterBomLine" ADD CONSTRAINT "MasterBomLine_skuVersionId_fkey" FOREIGN KEY ("skuVersionId") REFERENCES "SkuMasterVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
