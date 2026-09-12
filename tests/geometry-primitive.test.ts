import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createGeometryPrimitiveLine,
  createGeometryPrimitiveRectangle,
  createGeometryPrimitivePolyline,
  createGeometryPrimitiveArc,
  createGeometryPrimitiveCircle,
  deleteGeometryNode,
} from "@/lib/graph/geometry";
import { deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
});

describe("createGeometryPrimitiveLine", () => {
  it("creates a GeometryNode (nodeType PRIMITIVE, primitiveKind LINE) and a GeometryPrimitiveLine row sharing its id", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Fixture" } });
    designIdToCleanUp = design.id;

    const line = await createGeometryPrimitiveLine(design.id, {
      startXMm: 0,
      startYMm: 0,
      endXMm: 1000,
      endYMm: 500,
      label: "Diagonal reference line",
    });

    expect(line.startXMm).toBe(0);
    expect(line.startYMm).toBe(0);
    expect(line.endXMm).toBe(1000);
    expect(line.endYMm).toBe(500);

    const node = await prisma.geometryNode.findUnique({ where: { id: line.id } });
    expect(node).not.toBeNull();
    expect(node?.nodeType).toBe("PRIMITIVE");
    expect(node?.primitiveKind).toBe("LINE");
    expect(node?.label).toBe("Diagonal reference line");
  });

  it("defaults label to null when omitted", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Fixture 2" } });
    designIdToCleanUp = design.id;

    const line = await createGeometryPrimitiveLine(design.id, {
      startXMm: 10,
      startYMm: 20,
      endXMm: 30,
      endYMm: 40,
    });

    const node = await prisma.geometryNode.findUnique({ where: { id: line.id } });
    expect(node?.label).toBeNull();
  });

  it("the existing generic deleteGeometryNode cascades and removes both rows for a primitive", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Fixture 3" } });
    designIdToCleanUp = design.id;

    const line = await createGeometryPrimitiveLine(design.id, {
      startXMm: 0,
      startYMm: 0,
      endXMm: 100,
      endYMm: 100,
    });

    await deleteGeometryNode(line.id);

    const node = await prisma.geometryNode.findUnique({ where: { id: line.id } });
    const primitiveLine = await prisma.geometryPrimitiveLine.findUnique({ where: { id: line.id } });
    expect(node).toBeNull();
    expect(primitiveLine).toBeNull();
  });
});

describe("createGeometryPrimitiveRectangle", () => {
  it("creates a GeometryNode (nodeType PRIMITIVE, primitiveKind RECTANGLE) and a GeometryPrimitiveRectangle row sharing its id", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Rectangle Fixture" } });
    designIdToCleanUp = design.id;

    const rect = await createGeometryPrimitiveRectangle(design.id, {
      xMm: 0,
      yMm: 0,
      widthMm: 500,
      heightMm: 300,
      rotationDeg: 45,
      label: "Rotated rectangle",
    });

    expect(rect.xMm).toBe(0);
    expect(rect.yMm).toBe(0);
    expect(rect.widthMm).toBe(500);
    expect(rect.heightMm).toBe(300);
    expect(rect.rotationDeg).toBe(45);

    const node = await prisma.geometryNode.findUnique({ where: { id: rect.id } });
    expect(node?.nodeType).toBe("PRIMITIVE");
    expect(node?.primitiveKind).toBe("RECTANGLE");
    expect(node?.label).toBe("Rotated rectangle");
  });

  it("defaults rotationDeg to 0 and label to null when omitted", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Rectangle Fixture 2" } });
    designIdToCleanUp = design.id;

    const rect = await createGeometryPrimitiveRectangle(design.id, { xMm: 10, yMm: 20, widthMm: 100, heightMm: 50 });

    expect(rect.rotationDeg).toBe(0);
    const node = await prisma.geometryNode.findUnique({ where: { id: rect.id } });
    expect(node?.label).toBeNull();
  });

  it("the existing generic deleteGeometryNode cascades and removes both rows", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Rectangle Fixture 3" } });
    designIdToCleanUp = design.id;

    const rect = await createGeometryPrimitiveRectangle(design.id, { xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 });
    await deleteGeometryNode(rect.id);

    expect(await prisma.geometryNode.findUnique({ where: { id: rect.id } })).toBeNull();
    expect(await prisma.geometryPrimitiveRectangle.findUnique({ where: { id: rect.id } })).toBeNull();
  });
});

describe("createGeometryPrimitivePolyline", () => {
  it("creates a GeometryNode (nodeType PRIMITIVE, primitiveKind POLYLINE) and persists points in order", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Polyline Fixture" } });
    designIdToCleanUp = design.id;

    const polyline = await createGeometryPrimitivePolyline(design.id, {
      points: [
        { xMm: 0, yMm: 0, bulge: 0 },
        { xMm: 100, yMm: 0, bulge: 0.5 },
        { xMm: 100, yMm: 100 },
      ],
      closed: true,
      label: "Triangle path",
    });

    expect(polyline.closed).toBe(true);
    expect(polyline.points).toHaveLength(3);
    expect(polyline.points.map((p) => p.sequenceIndex)).toEqual([0, 1, 2]);
    expect(polyline.points[0]).toMatchObject({ xMm: 0, yMm: 0, bulge: 0 });
    expect(polyline.points[1]).toMatchObject({ xMm: 100, yMm: 0, bulge: 0.5 });
    expect(polyline.points[2]).toMatchObject({ xMm: 100, yMm: 100, bulge: 0 });

    const node = await prisma.geometryNode.findUnique({ where: { id: polyline.id } });
    expect(node?.nodeType).toBe("PRIMITIVE");
    expect(node?.primitiveKind).toBe("POLYLINE");
    expect(node?.label).toBe("Triangle path");
  });

  it("defaults closed to false and per-point bulge to 0 when omitted", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Polyline Fixture 2" } });
    designIdToCleanUp = design.id;

    const polyline = await createGeometryPrimitivePolyline(design.id, {
      points: [
        { xMm: 0, yMm: 0 },
        { xMm: 10, yMm: 10 },
      ],
    });

    expect(polyline.closed).toBe(false);
    expect(polyline.points.every((p) => p.bulge === 0)).toBe(true);
  });

  it("throws badRequest when given fewer than 2 points", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Polyline Fixture 3" } });
    designIdToCleanUp = design.id;

    await expect(
      createGeometryPrimitivePolyline(design.id, { points: [{ xMm: 0, yMm: 0 }] }),
    ).rejects.toThrow();
  });

  it("the existing generic deleteGeometryNode cascades the parent row and all child point rows", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Polyline Fixture 4" } });
    designIdToCleanUp = design.id;

    const polyline = await createGeometryPrimitivePolyline(design.id, {
      points: [
        { xMm: 0, yMm: 0 },
        { xMm: 10, yMm: 10 },
        { xMm: 20, yMm: 0 },
      ],
    });
    await deleteGeometryNode(polyline.id);

    expect(await prisma.geometryNode.findUnique({ where: { id: polyline.id } })).toBeNull();
    expect(await prisma.geometryPrimitivePolyline.findUnique({ where: { id: polyline.id } })).toBeNull();
    expect(await prisma.geometryPrimitivePolylinePoint.findMany({ where: { polylineId: polyline.id } })).toHaveLength(0);
  });
});

describe("createGeometryPrimitiveArc", () => {
  it("creates a GeometryNode (nodeType PRIMITIVE, primitiveKind ARC) and a GeometryPrimitiveArc row sharing its id", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Arc Fixture" } });
    designIdToCleanUp = design.id;

    const arc = await createGeometryPrimitiveArc(design.id, {
      centerXMm: 500,
      centerYMm: 500,
      radiusMm: 200,
      startAngleDeg: 0,
      sweepAngleDeg: 90,
      label: "Quarter arc",
    });

    expect(arc.centerXMm).toBe(500);
    expect(arc.centerYMm).toBe(500);
    expect(arc.radiusMm).toBe(200);
    expect(arc.startAngleDeg).toBe(0);
    expect(arc.sweepAngleDeg).toBe(90);

    const node = await prisma.geometryNode.findUnique({ where: { id: arc.id } });
    expect(node?.nodeType).toBe("PRIMITIVE");
    expect(node?.primitiveKind).toBe("ARC");
    expect(node?.label).toBe("Quarter arc");
  });

  it("defaults label to null when omitted", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Arc Fixture 2" } });
    designIdToCleanUp = design.id;

    const arc = await createGeometryPrimitiveArc(design.id, {
      centerXMm: 0,
      centerYMm: 0,
      radiusMm: 100,
      startAngleDeg: 10,
      sweepAngleDeg: -45,
    });

    const node = await prisma.geometryNode.findUnique({ where: { id: arc.id } });
    expect(node?.label).toBeNull();
  });

  it("the existing generic deleteGeometryNode cascades and removes both rows", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Arc Fixture 3" } });
    designIdToCleanUp = design.id;

    const arc = await createGeometryPrimitiveArc(design.id, {
      centerXMm: 0,
      centerYMm: 0,
      radiusMm: 50,
      startAngleDeg: 0,
      sweepAngleDeg: 180,
    });
    await deleteGeometryNode(arc.id);

    expect(await prisma.geometryNode.findUnique({ where: { id: arc.id } })).toBeNull();
    expect(await prisma.geometryPrimitiveArc.findUnique({ where: { id: arc.id } })).toBeNull();
  });
});

describe("createGeometryPrimitiveCircle", () => {
  it("creates a GeometryNode (nodeType PRIMITIVE, primitiveKind CIRCLE) and a GeometryPrimitiveCircle row sharing its id", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Circle Fixture" } });
    designIdToCleanUp = design.id;

    const circle = await createGeometryPrimitiveCircle(design.id, {
      centerXMm: 250,
      centerYMm: 250,
      radiusMm: 75,
      label: "Fixture hole",
    });

    expect(circle.centerXMm).toBe(250);
    expect(circle.centerYMm).toBe(250);
    expect(circle.radiusMm).toBe(75);

    const node = await prisma.geometryNode.findUnique({ where: { id: circle.id } });
    expect(node?.nodeType).toBe("PRIMITIVE");
    expect(node?.primitiveKind).toBe("CIRCLE");
    expect(node?.label).toBe("Fixture hole");
  });

  it("defaults label to null when omitted", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Circle Fixture 2" } });
    designIdToCleanUp = design.id;

    const circle = await createGeometryPrimitiveCircle(design.id, { centerXMm: 0, centerYMm: 0, radiusMm: 10 });
    const node = await prisma.geometryNode.findUnique({ where: { id: circle.id } });
    expect(node?.label).toBeNull();
  });

  it("the existing generic deleteGeometryNode cascades and removes both rows", async () => {
    const design = await prisma.design.create({ data: { name: "Geometry Primitive Circle Fixture 3" } });
    designIdToCleanUp = design.id;

    const circle = await createGeometryPrimitiveCircle(design.id, { centerXMm: 0, centerYMm: 0, radiusMm: 10 });
    await deleteGeometryNode(circle.id);

    expect(await prisma.geometryNode.findUnique({ where: { id: circle.id } })).toBeNull();
    expect(await prisma.geometryPrimitiveCircle.findUnique({ where: { id: circle.id } })).toBeNull();
  });
});
