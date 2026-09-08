-- DropForeignKey
ALTER TABLE "MasterBomLine" DROP CONSTRAINT "MasterBomLine_sourceGeometryProductRelationshipId_fkey";

-- DropForeignKey
ALTER TABLE "MasterBomLine" DROP CONSTRAINT "MasterBomLine_sourceProductInstanceEdgeId_fkey";

-- DropForeignKey
ALTER TABLE "MasterBomLine" DROP CONSTRAINT "MasterBomLine_sourceProductInstanceId_fkey";

-- AddForeignKey
ALTER TABLE "MasterBomLine" ADD CONSTRAINT "MasterBomLine_sourceGeometryProductRelationshipId_fkey" FOREIGN KEY ("sourceGeometryProductRelationshipId") REFERENCES "GeometryProductRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterBomLine" ADD CONSTRAINT "MasterBomLine_sourceProductInstanceEdgeId_fkey" FOREIGN KEY ("sourceProductInstanceEdgeId") REFERENCES "ProductInstanceEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterBomLine" ADD CONSTRAINT "MasterBomLine_sourceProductInstanceId_fkey" FOREIGN KEY ("sourceProductInstanceId") REFERENCES "ProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
