-- AlterEnum
BEGIN;
CREATE TYPE "GeometryEdgeRelationshipType_new" AS ENUM ('ADJACENT_TO', 'MEETS', 'CONTINUES_TO', 'SHARES_BOUNDARY', 'TERMINATES_AT');
ALTER TABLE "GeometryEdgeRelationship" ALTER COLUMN "relationshipType" TYPE "GeometryEdgeRelationshipType_new" USING ("relationshipType"::text::"GeometryEdgeRelationshipType_new");
ALTER TYPE "GeometryEdgeRelationshipType" RENAME TO "GeometryEdgeRelationshipType_old";
ALTER TYPE "GeometryEdgeRelationshipType_new" RENAME TO "GeometryEdgeRelationshipType";
DROP TYPE "public"."GeometryEdgeRelationshipType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SkuEdgeType_new" AS ENUM ('REQUIRES', 'CONNECTS_TO', 'TERMINATES_WITH', 'SUPPORTS', 'COMPATIBLE_WITH', 'INTERACTS_WITH', 'INSTALLED_WITH');
ALTER TABLE "SkuEdge" ALTER COLUMN "edgeType" TYPE "SkuEdgeType_new" USING ("edgeType"::text::"SkuEdgeType_new");
ALTER TABLE "ProductInstanceEdge" ALTER COLUMN "edgeType" TYPE "SkuEdgeType_new" USING ("edgeType"::text::"SkuEdgeType_new");
ALTER TYPE "SkuEdgeType" RENAME TO "SkuEdgeType_old";
ALTER TYPE "SkuEdgeType_new" RENAME TO "SkuEdgeType";
DROP TYPE "public"."SkuEdgeType_old";
COMMIT;

-- AlterTable
ALTER TABLE "GeometryProductRelationship" ADD COLUMN     "condition" JSONB,
ADD COLUMN     "quantityRule" JSONB;

-- AlterTable
ALTER TABLE "Panel" ADD COLUMN     "isOffcut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offcutReusable" BOOLEAN;

-- AlterTable
ALTER TABLE "SkuMaster" DROP COLUMN "category",
ADD COLUMN     "categoryId" TEXT NOT NULL,
ADD COLUMN     "minCutPieceMm" DOUBLE PRECISION;

-- DropEnum
DROP TYPE "SkuCategory";

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

-- CreateIndex
CREATE INDEX "SkuMaster_categoryId_idx" ON "SkuMaster"("categoryId");

-- AddForeignKey
ALTER TABLE "SkuMaster" ADD CONSTRAINT "SkuMaster_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

