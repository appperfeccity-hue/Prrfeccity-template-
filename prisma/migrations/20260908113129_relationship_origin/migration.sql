-- CreateEnum
CREATE TYPE "RelationshipOrigin" AS ENUM ('DESIGNER_DEFINED', 'CATALOG_DERIVED');

-- AlterTable
ALTER TABLE "GeometryProductRelationship" ADD COLUMN     "origin" "RelationshipOrigin" NOT NULL DEFAULT 'DESIGNER_DEFINED';

-- AlterTable
ALTER TABLE "ProductInstanceEdge" ADD COLUMN     "origin" "RelationshipOrigin" NOT NULL DEFAULT 'DESIGNER_DEFINED';

