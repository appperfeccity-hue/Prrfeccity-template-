-- AlterTable
ALTER TABLE "ProductInstance" ADD COLUMN     "colourOptionId" TEXT,
ADD COLUMN     "designOptionId" TEXT,
ADD COLUMN     "sizeOptionId" TEXT;

-- AlterTable
ALTER TABLE "SkuMaster" ADD COLUMN     "rotatable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FurnitureDesignOption" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "FurnitureDesignOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FurnitureColourOption" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "swatchColor" TEXT NOT NULL,

    CONSTRAINT "FurnitureColourOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FurnitureSizeOption" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "depthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FurnitureSizeOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FurnitureDesignOption_skuId_key_key" ON "FurnitureDesignOption"("skuId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FurnitureColourOption_skuId_key_key" ON "FurnitureColourOption"("skuId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FurnitureSizeOption_skuId_key_key" ON "FurnitureSizeOption"("skuId", "key");

-- AddForeignKey
ALTER TABLE "FurnitureDesignOption" ADD CONSTRAINT "FurnitureDesignOption_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SkuMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FurnitureColourOption" ADD CONSTRAINT "FurnitureColourOption_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SkuMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FurnitureSizeOption" ADD CONSTRAINT "FurnitureSizeOption_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SkuMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstance" ADD CONSTRAINT "ProductInstance_designOptionId_fkey" FOREIGN KEY ("designOptionId") REFERENCES "FurnitureDesignOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstance" ADD CONSTRAINT "ProductInstance_colourOptionId_fkey" FOREIGN KEY ("colourOptionId") REFERENCES "FurnitureColourOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstance" ADD CONSTRAINT "ProductInstance_sizeOptionId_fkey" FOREIGN KEY ("sizeOptionId") REFERENCES "FurnitureSizeOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
