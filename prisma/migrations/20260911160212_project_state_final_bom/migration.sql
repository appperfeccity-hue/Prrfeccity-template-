-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectProductInstance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceProductInstanceId" TEXT,
    "skuId" TEXT NOT NULL,
    "geometryNodeId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "z" DOUBLE PRECISION,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "designOptionId" TEXT,
    "colourOptionId" TEXT,
    "sizeOptionId" TEXT,

    CONSTRAINT "ProjectProductInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectProductInstanceEdge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceProductInstanceEdgeId" TEXT NOT NULL,
    "fromInstanceId" TEXT NOT NULL,
    "toInstanceId" TEXT NOT NULL,
    "edgeType" "SkuEdgeType" NOT NULL,
    "sourceSkuEdgeId" TEXT,

    CONSTRAINT "ProjectProductInstanceEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectGeometryProductRelationship" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceGeometryProductRelationshipId" TEXT NOT NULL,
    "geometryEdgeId" TEXT,
    "geometryNodeId" TEXT,
    "productInstanceId" TEXT NOT NULL,
    "relationshipType" "GeometryProductRelationshipType" NOT NULL,
    "condition" JSONB,
    "quantityRule" JSONB,

    CONSTRAINT "ProjectGeometryProductRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalBom" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinalBom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalBomLine" (
    "id" TEXT NOT NULL,
    "finalBomId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "skuVersionId" TEXT,
    "sourceProjectGeometryProductRelationshipId" TEXT,
    "sourceProjectProductInstanceEdgeId" TEXT,
    "sourceProjectProductInstanceId" TEXT,

    CONSTRAINT "FinalBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_templateId_idx" ON "Project"("templateId");

-- CreateIndex
CREATE INDEX "Project_createdByUserId_idx" ON "Project"("createdByUserId");

-- CreateIndex
CREATE INDEX "ProjectProductInstance_projectId_skuId_idx" ON "ProjectProductInstance"("projectId", "skuId");

-- CreateIndex
CREATE INDEX "ProjectProductInstance_sourceProductInstanceId_idx" ON "ProjectProductInstance"("sourceProductInstanceId");

-- CreateIndex
CREATE INDEX "ProjectProductInstanceEdge_projectId_idx" ON "ProjectProductInstanceEdge"("projectId");

-- CreateIndex
CREATE INDEX "ProjectProductInstanceEdge_fromInstanceId_idx" ON "ProjectProductInstanceEdge"("fromInstanceId");

-- CreateIndex
CREATE INDEX "ProjectProductInstanceEdge_toInstanceId_idx" ON "ProjectProductInstanceEdge"("toInstanceId");

-- CreateIndex
CREATE INDEX "ProjectGeometryProductRelationship_projectId_idx" ON "ProjectGeometryProductRelationship"("projectId");

-- CreateIndex
CREATE INDEX "ProjectGeometryProductRelationship_geometryEdgeId_idx" ON "ProjectGeometryProductRelationship"("geometryEdgeId");

-- CreateIndex
CREATE INDEX "ProjectGeometryProductRelationship_geometryNodeId_idx" ON "ProjectGeometryProductRelationship"("geometryNodeId");

-- CreateIndex
CREATE INDEX "ProjectGeometryProductRelationship_productInstanceId_idx" ON "ProjectGeometryProductRelationship"("productInstanceId");

-- CreateIndex
CREATE INDEX "FinalBom_projectId_idx" ON "FinalBom"("projectId");

-- CreateIndex
CREATE INDEX "FinalBomLine_finalBomId_idx" ON "FinalBomLine"("finalBomId");

-- CreateIndex
CREATE INDEX "FinalBomLine_skuId_idx" ON "FinalBomLine"("skuId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Design"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstance" ADD CONSTRAINT "ProjectProductInstance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstance" ADD CONSTRAINT "ProjectProductInstance_sourceProductInstanceId_fkey" FOREIGN KEY ("sourceProductInstanceId") REFERENCES "ProductInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstance" ADD CONSTRAINT "ProjectProductInstance_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SkuMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstance" ADD CONSTRAINT "ProjectProductInstance_geometryNodeId_fkey" FOREIGN KEY ("geometryNodeId") REFERENCES "GeometryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstance" ADD CONSTRAINT "ProjectProductInstance_designOptionId_fkey" FOREIGN KEY ("designOptionId") REFERENCES "FurnitureDesignOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstance" ADD CONSTRAINT "ProjectProductInstance_colourOptionId_fkey" FOREIGN KEY ("colourOptionId") REFERENCES "FurnitureColourOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstance" ADD CONSTRAINT "ProjectProductInstance_sizeOptionId_fkey" FOREIGN KEY ("sizeOptionId") REFERENCES "FurnitureSizeOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstanceEdge" ADD CONSTRAINT "ProjectProductInstanceEdge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstanceEdge" ADD CONSTRAINT "ProjectProductInstanceEdge_sourceProductInstanceEdgeId_fkey" FOREIGN KEY ("sourceProductInstanceEdgeId") REFERENCES "ProductInstanceEdge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstanceEdge" ADD CONSTRAINT "ProjectProductInstanceEdge_fromInstanceId_fkey" FOREIGN KEY ("fromInstanceId") REFERENCES "ProjectProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstanceEdge" ADD CONSTRAINT "ProjectProductInstanceEdge_toInstanceId_fkey" FOREIGN KEY ("toInstanceId") REFERENCES "ProjectProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProductInstanceEdge" ADD CONSTRAINT "ProjectProductInstanceEdge_sourceSkuEdgeId_fkey" FOREIGN KEY ("sourceSkuEdgeId") REFERENCES "SkuEdge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGeometryProductRelationship" ADD CONSTRAINT "ProjectGeometryProductRelationship_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGeometryProductRelationship" ADD CONSTRAINT "ProjectGeometryProductRelationship_sourceGeometryProductRe_fkey" FOREIGN KEY ("sourceGeometryProductRelationshipId") REFERENCES "GeometryProductRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGeometryProductRelationship" ADD CONSTRAINT "ProjectGeometryProductRelationship_geometryEdgeId_fkey" FOREIGN KEY ("geometryEdgeId") REFERENCES "GeometryEdge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGeometryProductRelationship" ADD CONSTRAINT "ProjectGeometryProductRelationship_geometryNodeId_fkey" FOREIGN KEY ("geometryNodeId") REFERENCES "GeometryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGeometryProductRelationship" ADD CONSTRAINT "ProjectGeometryProductRelationship_productInstanceId_fkey" FOREIGN KEY ("productInstanceId") REFERENCES "ProjectProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalBom" ADD CONSTRAINT "FinalBom_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalBomLine" ADD CONSTRAINT "FinalBomLine_finalBomId_fkey" FOREIGN KEY ("finalBomId") REFERENCES "FinalBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalBomLine" ADD CONSTRAINT "FinalBomLine_skuVersionId_fkey" FOREIGN KEY ("skuVersionId") REFERENCES "SkuMasterVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalBomLine" ADD CONSTRAINT "FinalBomLine_sourceProjectGeometryProductRelationshipId_fkey" FOREIGN KEY ("sourceProjectGeometryProductRelationshipId") REFERENCES "ProjectGeometryProductRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalBomLine" ADD CONSTRAINT "FinalBomLine_sourceProjectProductInstanceEdgeId_fkey" FOREIGN KEY ("sourceProjectProductInstanceEdgeId") REFERENCES "ProjectProductInstanceEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalBomLine" ADD CONSTRAINT "FinalBomLine_sourceProjectProductInstanceId_fkey" FOREIGN KEY ("sourceProjectProductInstanceId") REFERENCES "ProjectProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
