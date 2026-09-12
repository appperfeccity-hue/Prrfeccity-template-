import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createGeometryPrimitiveLine, deleteGeometryNode } from "@/lib/graph/geometry";
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
