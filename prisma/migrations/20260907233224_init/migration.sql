-- CreateEnum
CREATE TYPE "DesignStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "GeometryNodeType" AS ENUM ('WALL', 'ZONE', 'PARTITION', 'PANEL');

-- CreateEnum
CREATE TYPE "WallType" AS ENUM ('STRAIGHT_LTR', 'STRAIGHT_RTL', 'L_TYPE');

-- CreateEnum
CREATE TYPE "ZoneAssociation" AS ENUM ('WALL', 'STRUCTURE');

-- CreateEnum
CREATE TYPE "PanelOrientation" AS ENUM ('VERTICAL', 'HORIZONTAL');

-- CreateEnum
CREATE TYPE "GeometryEdgeRole" AS ENUM ('LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'CORNER', 'OUTER_BOUNDARY', 'INNER_BOUNDARY', 'PARTITION_EDGE');

-- CreateEnum
CREATE TYPE "GeometryEdgeRelationshipType" AS ENUM ('ADJACENCY');

-- CreateEnum
CREATE TYPE "SkuCategory" AS ENUM ('PRIMARY', 'STRUCTURAL', 'CONNECTION', 'DECORATIVE', 'FUNCTIONAL', 'INSTALLATION', 'FURNITURE');

-- CreateEnum
CREATE TYPE "SkuEdgeType" AS ENUM ('REQUIRES', 'CONNECTS', 'TERMINATES', 'SUPPORTS', 'INTERACTS');

-- CreateEnum
CREATE TYPE "GeometryProductRelationshipType" AS ENUM ('HAS_TREATMENT', 'SUPPORTS', 'TERMINATES', 'BOUNDARY_OF', 'POSITIONED_AT', 'ADJACENT_TO');

-- CreateEnum
CREATE TYPE "ParameterType" AS ENUM ('NUMERIC_RANGE', 'ENUM_SELECTION', 'POSITION', 'SKU_SUBSTITUTION', 'EDGE_TREATMENT', 'QUANTITY');

-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnailUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DesignStatus" NOT NULL DEFAULT 'DRAFT',
    "rootTemplateId" TEXT,
    "parentTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignValidationResult" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passed" BOOLEAN NOT NULL,
    "issues" JSONB[] DEFAULT ARRAY[]::JSONB[],

    CONSTRAINT "DesignValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryNode" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "nodeType" "GeometryNodeType" NOT NULL,
    "label" TEXT,

    CONSTRAINT "GeometryNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wall" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "wallType" "WallType" NOT NULL,
    "lengthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "cornerAngleDeg" DOUBLE PRECISION,

    CONSTRAINT "Wall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "wallId" TEXT,
    "associatesWith" "ZoneAssociation" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "hasCoveLighting" BOOLEAN NOT NULL DEFAULT false,
    "coveLightZMm" DOUBLE PRECISION,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZonePartition" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ZonePartition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Panel" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "partitionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "orientation" "PanelOrientation" NOT NULL,

    CONSTRAINT "Panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryEdge" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "edgeRole" "GeometryEdgeRole" NOT NULL,
    "requiresTermination" BOOLEAN NOT NULL DEFAULT false,
    "requiresConnector" BOOLEAN NOT NULL DEFAULT false,
    "requiresTrim" BOOLEAN NOT NULL DEFAULT false,
    "isLightingBoundary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "GeometryEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryEdgeRelationship" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "edgeAId" TEXT NOT NULL,
    "edgeBId" TEXT NOT NULL,
    "relationshipType" "GeometryEdgeRelationshipType" NOT NULL,

    CONSTRAINT "GeometryEdgeRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuMaster" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkuCategory" NOT NULL,
    "defaultWidthMm" DOUBLE PRECISION,
    "defaultUnit" TEXT NOT NULL DEFAULT 'EA',
    "attributes" JSONB,

    CONSTRAINT "SkuMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuEdge" (
    "id" TEXT NOT NULL,
    "fromSkuId" TEXT NOT NULL,
    "toSkuId" TEXT NOT NULL,
    "edgeType" "SkuEdgeType" NOT NULL,

    CONSTRAINT "SkuEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInstance" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "geometryNodeId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "z" DOUBLE PRECISION,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "ProductInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInstanceEdge" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "fromInstanceId" TEXT NOT NULL,
    "toInstanceId" TEXT NOT NULL,
    "edgeType" "SkuEdgeType" NOT NULL,
    "sourceSkuEdgeId" TEXT,

    CONSTRAINT "ProductInstanceEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryProductRelationship" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "geometryEdgeId" TEXT,
    "geometryNodeId" TEXT,
    "productInstanceId" TEXT NOT NULL,
    "relationshipType" "GeometryProductRelationshipType" NOT NULL,

    CONSTRAINT "GeometryProductRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateParameter" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "targetProductInstanceId" TEXT,
    "targetGeometryEdgeId" TEXT,
    "paramKey" TEXT NOT NULL,
    "paramType" "ParameterType" NOT NULL,
    "label" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "unit" TEXT,

    CONSTRAINT "TemplateParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantPermission" (
    "id" TEXT NOT NULL,
    "templateParameterId" TEXT NOT NULL,
    "editableByConsultant" BOOLEAN NOT NULL DEFAULT false,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "allowedValues" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ConsultantPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterBom" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterBom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterBomLine" (
    "id" TEXT NOT NULL,
    "masterBomId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "sourceGeometryProductRelationshipId" TEXT,
    "sourceProductInstanceEdgeId" TEXT,
    "sourceProductInstanceId" TEXT,

    CONSTRAINT "MasterBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Design_rootTemplateId_idx" ON "Design"("rootTemplateId");

-- CreateIndex
CREATE INDEX "Design_status_idx" ON "Design"("status");

-- CreateIndex
CREATE INDEX "DesignValidationResult_designId_ranAt_idx" ON "DesignValidationResult"("designId", "ranAt");

-- CreateIndex
CREATE INDEX "GeometryNode_designId_nodeType_idx" ON "GeometryNode"("designId", "nodeType");

-- CreateIndex
CREATE INDEX "GeometryEdge_designId_edgeRole_idx" ON "GeometryEdge"("designId", "edgeRole");

-- CreateIndex
CREATE INDEX "GeometryEdge_nodeId_idx" ON "GeometryEdge"("nodeId");

-- CreateIndex
CREATE INDEX "GeometryEdgeRelationship_designId_idx" ON "GeometryEdgeRelationship"("designId");

-- CreateIndex
CREATE INDEX "GeometryEdgeRelationship_edgeAId_idx" ON "GeometryEdgeRelationship"("edgeAId");

-- CreateIndex
CREATE INDEX "GeometryEdgeRelationship_edgeBId_idx" ON "GeometryEdgeRelationship"("edgeBId");

-- CreateIndex
CREATE UNIQUE INDEX "SkuMaster_code_key" ON "SkuMaster"("code");

-- CreateIndex
CREATE INDEX "SkuEdge_fromSkuId_idx" ON "SkuEdge"("fromSkuId");

-- CreateIndex
CREATE INDEX "SkuEdge_toSkuId_idx" ON "SkuEdge"("toSkuId");

-- CreateIndex
CREATE INDEX "ProductInstance_designId_skuId_idx" ON "ProductInstance"("designId", "skuId");

-- CreateIndex
CREATE INDEX "ProductInstanceEdge_designId_idx" ON "ProductInstanceEdge"("designId");

-- CreateIndex
CREATE INDEX "ProductInstanceEdge_fromInstanceId_idx" ON "ProductInstanceEdge"("fromInstanceId");

-- CreateIndex
CREATE INDEX "ProductInstanceEdge_toInstanceId_idx" ON "ProductInstanceEdge"("toInstanceId");

-- CreateIndex
CREATE INDEX "GeometryProductRelationship_designId_idx" ON "GeometryProductRelationship"("designId");

-- CreateIndex
CREATE INDEX "GeometryProductRelationship_geometryEdgeId_idx" ON "GeometryProductRelationship"("geometryEdgeId");

-- CreateIndex
CREATE INDEX "GeometryProductRelationship_geometryNodeId_idx" ON "GeometryProductRelationship"("geometryNodeId");

-- CreateIndex
CREATE INDEX "GeometryProductRelationship_productInstanceId_idx" ON "GeometryProductRelationship"("productInstanceId");

-- CreateIndex
CREATE INDEX "TemplateParameter_templateId_idx" ON "TemplateParameter"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantPermission_templateParameterId_key" ON "ConsultantPermission"("templateParameterId");

-- CreateIndex
CREATE INDEX "MasterBom_templateId_idx" ON "MasterBom"("templateId");

-- CreateIndex
CREATE INDEX "MasterBomLine_masterBomId_idx" ON "MasterBomLine"("masterBomId");

-- CreateIndex
CREATE INDEX "MasterBomLine_skuId_idx" ON "MasterBomLine"("skuId");

-- AddForeignKey
ALTER TABLE "DesignValidationResult" ADD CONSTRAINT "DesignValidationResult_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryNode" ADD CONSTRAINT "GeometryNode_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wall" ADD CONSTRAINT "Wall_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "Wall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZonePartition" ADD CONSTRAINT "ZonePartition_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZonePartition" ADD CONSTRAINT "ZonePartition_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_partitionId_fkey" FOREIGN KEY ("partitionId") REFERENCES "ZonePartition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryEdge" ADD CONSTRAINT "GeometryEdge_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryEdge" ADD CONSTRAINT "GeometryEdge_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryEdgeRelationship" ADD CONSTRAINT "GeometryEdgeRelationship_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryEdgeRelationship" ADD CONSTRAINT "GeometryEdgeRelationship_edgeAId_fkey" FOREIGN KEY ("edgeAId") REFERENCES "GeometryEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryEdgeRelationship" ADD CONSTRAINT "GeometryEdgeRelationship_edgeBId_fkey" FOREIGN KEY ("edgeBId") REFERENCES "GeometryEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuEdge" ADD CONSTRAINT "SkuEdge_fromSkuId_fkey" FOREIGN KEY ("fromSkuId") REFERENCES "SkuMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuEdge" ADD CONSTRAINT "SkuEdge_toSkuId_fkey" FOREIGN KEY ("toSkuId") REFERENCES "SkuMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstance" ADD CONSTRAINT "ProductInstance_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstance" ADD CONSTRAINT "ProductInstance_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SkuMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstance" ADD CONSTRAINT "ProductInstance_geometryNodeId_fkey" FOREIGN KEY ("geometryNodeId") REFERENCES "GeometryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstanceEdge" ADD CONSTRAINT "ProductInstanceEdge_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstanceEdge" ADD CONSTRAINT "ProductInstanceEdge_fromInstanceId_fkey" FOREIGN KEY ("fromInstanceId") REFERENCES "ProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstanceEdge" ADD CONSTRAINT "ProductInstanceEdge_toInstanceId_fkey" FOREIGN KEY ("toInstanceId") REFERENCES "ProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInstanceEdge" ADD CONSTRAINT "ProductInstanceEdge_sourceSkuEdgeId_fkey" FOREIGN KEY ("sourceSkuEdgeId") REFERENCES "SkuEdge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryProductRelationship" ADD CONSTRAINT "GeometryProductRelationship_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryProductRelationship" ADD CONSTRAINT "GeometryProductRelationship_geometryEdgeId_fkey" FOREIGN KEY ("geometryEdgeId") REFERENCES "GeometryEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryProductRelationship" ADD CONSTRAINT "GeometryProductRelationship_geometryNodeId_fkey" FOREIGN KEY ("geometryNodeId") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryProductRelationship" ADD CONSTRAINT "GeometryProductRelationship_productInstanceId_fkey" FOREIGN KEY ("productInstanceId") REFERENCES "ProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateParameter" ADD CONSTRAINT "TemplateParameter_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateParameter" ADD CONSTRAINT "TemplateParameter_targetProductInstanceId_fkey" FOREIGN KEY ("targetProductInstanceId") REFERENCES "ProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateParameter" ADD CONSTRAINT "TemplateParameter_targetGeometryEdgeId_fkey" FOREIGN KEY ("targetGeometryEdgeId") REFERENCES "GeometryEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantPermission" ADD CONSTRAINT "ConsultantPermission_templateParameterId_fkey" FOREIGN KEY ("templateParameterId") REFERENCES "TemplateParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterBom" ADD CONSTRAINT "MasterBom_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterBomLine" ADD CONSTRAINT "MasterBomLine_masterBomId_fkey" FOREIGN KEY ("masterBomId") REFERENCES "MasterBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterBomLine" ADD CONSTRAINT "MasterBomLine_sourceGeometryProductRelationshipId_fkey" FOREIGN KEY ("sourceGeometryProductRelationshipId") REFERENCES "GeometryProductRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterBomLine" ADD CONSTRAINT "MasterBomLine_sourceProductInstanceEdgeId_fkey" FOREIGN KEY ("sourceProductInstanceEdgeId") REFERENCES "ProductInstanceEdge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterBomLine" ADD CONSTRAINT "MasterBomLine_sourceProductInstanceId_fkey" FOREIGN KEY ("sourceProductInstanceId") REFERENCES "ProductInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
