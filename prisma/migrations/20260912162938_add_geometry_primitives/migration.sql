-- CreateEnum
CREATE TYPE "GeometryPrimitiveKind" AS ENUM ('RECTANGLE', 'LINE', 'POLYLINE', 'ARC', 'CIRCLE');

-- AlterEnum
ALTER TYPE "GeometryNodeType" ADD VALUE 'PRIMITIVE';

-- AlterTable
ALTER TABLE "GeometryNode" ADD COLUMN     "primitiveKind" "GeometryPrimitiveKind";

-- CreateTable
CREATE TABLE "GeometryPrimitiveRectangle" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "xMm" DOUBLE PRECISION NOT NULL,
    "yMm" DOUBLE PRECISION NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "GeometryPrimitiveRectangle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryPrimitiveLine" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "startXMm" DOUBLE PRECISION NOT NULL,
    "startYMm" DOUBLE PRECISION NOT NULL,
    "endXMm" DOUBLE PRECISION NOT NULL,
    "endYMm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GeometryPrimitiveLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryPrimitivePolyline" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GeometryPrimitivePolyline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryPrimitivePolylinePoint" (
    "id" TEXT NOT NULL,
    "polylineId" TEXT NOT NULL,
    "sequenceIndex" INTEGER NOT NULL,
    "xMm" DOUBLE PRECISION NOT NULL,
    "yMm" DOUBLE PRECISION NOT NULL,
    "bulge" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "GeometryPrimitivePolylinePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryPrimitiveArc" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "centerXMm" DOUBLE PRECISION NOT NULL,
    "centerYMm" DOUBLE PRECISION NOT NULL,
    "radiusMm" DOUBLE PRECISION NOT NULL,
    "startAngleDeg" DOUBLE PRECISION NOT NULL,
    "sweepAngleDeg" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GeometryPrimitiveArc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeometryPrimitiveCircle" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "centerXMm" DOUBLE PRECISION NOT NULL,
    "centerYMm" DOUBLE PRECISION NOT NULL,
    "radiusMm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GeometryPrimitiveCircle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeometryPrimitivePolylinePoint_polylineId_sequenceIndex_key" ON "GeometryPrimitivePolylinePoint"("polylineId", "sequenceIndex");

-- CreateIndex
CREATE INDEX "GeometryNode_designId_primitiveKind_idx" ON "GeometryNode"("designId", "primitiveKind");

-- AddForeignKey
ALTER TABLE "GeometryPrimitiveRectangle" ADD CONSTRAINT "GeometryPrimitiveRectangle_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryPrimitiveLine" ADD CONSTRAINT "GeometryPrimitiveLine_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryPrimitivePolyline" ADD CONSTRAINT "GeometryPrimitivePolyline_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryPrimitivePolylinePoint" ADD CONSTRAINT "GeometryPrimitivePolylinePoint_polylineId_fkey" FOREIGN KEY ("polylineId") REFERENCES "GeometryPrimitivePolyline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryPrimitiveArc" ADD CONSTRAINT "GeometryPrimitiveArc_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeometryPrimitiveCircle" ADD CONSTRAINT "GeometryPrimitiveCircle_id_fkey" FOREIGN KEY ("id") REFERENCES "GeometryNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
