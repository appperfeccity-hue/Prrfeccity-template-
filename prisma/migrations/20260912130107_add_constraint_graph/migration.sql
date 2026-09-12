-- CreateEnum
CREATE TYPE "ConstraintTargetKind" AS ENUM ('FIXTURE', 'PRODUCT_INSTANCE', 'GEOMETRY_NODE', 'GEOMETRY_EDGE');

-- CreateEnum
CREATE TYPE "ConstraintAxis" AS ENUM ('X', 'Y');

-- CreateEnum
CREATE TYPE "ConstraintType" AS ENUM ('DISTANCE', 'ALIGN', 'EQUAL', 'MIN_MAX', 'CENTER', 'EDGE_TO_EDGE', 'FIXED_POSITION');

-- CreateTable
CREATE TABLE "Constraint" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "constraintType" "ConstraintType" NOT NULL,
    "targetAKind" "ConstraintTargetKind" NOT NULL,
    "targetAFixtureId" TEXT,
    "targetAProductInstanceId" TEXT,
    "targetAGeometryNodeId" TEXT,
    "targetAGeometryEdgeId" TEXT,
    "targetBKind" "ConstraintTargetKind",
    "targetBFixtureId" TEXT,
    "targetBProductInstanceId" TEXT,
    "targetBGeometryNodeId" TEXT,
    "targetBGeometryEdgeId" TEXT,
    "axis" "ConstraintAxis" NOT NULL,
    "valueMm" DOUBLE PRECISION,
    "minValueMm" DOUBLE PRECISION,
    "maxValueMm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Constraint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Constraint_designId_idx" ON "Constraint"("designId");

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_targetAFixtureId_fkey" FOREIGN KEY ("targetAFixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_targetAProductInstanceId_fkey" FOREIGN KEY ("targetAProductInstanceId") REFERENCES "ProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_targetAGeometryNodeId_fkey" FOREIGN KEY ("targetAGeometryNodeId") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_targetAGeometryEdgeId_fkey" FOREIGN KEY ("targetAGeometryEdgeId") REFERENCES "GeometryEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_targetBFixtureId_fkey" FOREIGN KEY ("targetBFixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_targetBProductInstanceId_fkey" FOREIGN KEY ("targetBProductInstanceId") REFERENCES "ProductInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_targetBGeometryNodeId_fkey" FOREIGN KEY ("targetBGeometryNodeId") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_targetBGeometryEdgeId_fkey" FOREIGN KEY ("targetBGeometryEdgeId") REFERENCES "GeometryEdge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
