import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createProductInstance, updateProductInstance } from "@/lib/graph/product";
import { deleteFixtureDesign } from "./helpers";

let designIdToCleanUp: string | undefined;

afterEach(async () => {
  if (designIdToCleanUp) {
    await deleteFixtureDesign(designIdToCleanUp);
    designIdToCleanUp = undefined;
  }
});

describe("Furniture Catalogue option enforcement (product.ts)", () => {
  it("rejects createProductInstance when an option id belongs to a different SKU", async () => {
    const design = await prisma.design.create({ data: { name: "Option Cross-SKU Fixture" } });
    designIdToCleanUp = design.id;
    const vanitySku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-VANITY-01" } });
    const stoolSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-STOOL-01" } });
    const stoolSizeOption = await prisma.furnitureSizeOption.findFirstOrThrow({ where: { skuId: stoolSku.id } });

    await expect(
      createProductInstance(design.id, { skuId: vanitySku.id, sizeOptionId: stoolSizeOption.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects updateProductInstance when a newly-assigned option id belongs to a different SKU", async () => {
    const design = await prisma.design.create({ data: { name: "Option Cross-SKU Update Fixture" } });
    designIdToCleanUp = design.id;
    const vanitySku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-VANITY-01" } });
    const stoolSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-STOOL-01" } });
    const stoolColourOption = await prisma.furnitureColourOption.findFirstOrThrow({ where: { skuId: stoolSku.id } });

    const instance = await createProductInstance(design.id, { skuId: vanitySku.id });

    await expect(
      updateProductInstance(instance.id, { colourOptionId: stoolColourOption.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts and persists a valid Design/Colour/Size option selection, round-tripping on read", async () => {
    const design = await prisma.design.create({ data: { name: "Option Persist Fixture" } });
    designIdToCleanUp = design.id;
    const vanitySku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-VANITY-01" } });
    const designOption = await prisma.furnitureDesignOption.findFirstOrThrow({ where: { skuId: vanitySku.id, key: "MODERN" } });
    const colourOption = await prisma.furnitureColourOption.findFirstOrThrow({ where: { skuId: vanitySku.id, key: "WALNUT" } });
    const sizeOption = await prisma.furnitureSizeOption.findFirstOrThrow({ where: { skuId: vanitySku.id, key: "LARGE" } });

    const created = await createProductInstance(design.id, {
      skuId: vanitySku.id,
      designOptionId: designOption.id,
      colourOptionId: colourOption.id,
      sizeOptionId: sizeOption.id,
    });
    expect(created.designOptionId).toBe(designOption.id);
    expect(created.colourOptionId).toBe(colourOption.id);
    expect(created.sizeOptionId).toBe(sizeOption.id);

    const smallSize = await prisma.furnitureSizeOption.findFirstOrThrow({ where: { skuId: vanitySku.id, key: "SMALL" } });
    const updated = await updateProductInstance(created.id, { sizeOptionId: smallSize.id });
    expect(updated.sizeOptionId).toBe(smallSize.id);
    // Fields not included in the update are left untouched, not nulled out.
    expect(updated.designOptionId).toBe(designOption.id);
    expect(updated.colourOptionId).toBe(colourOption.id);
  });
});

describe("Rotation permission enforcement (product.ts)", () => {
  it("rejects a rotationDeg change on an instance of a non-rotatable SKU", async () => {
    const design = await prisma.design.create({ data: { name: "Non-Rotatable Fixture" } });
    designIdToCleanUp = design.id;
    const stoolSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-STOOL-01" } });
    expect(stoolSku.rotatable).toBe(false);

    const instance = await createProductInstance(design.id, { skuId: stoolSku.id });

    await expect(updateProductInstance(instance.id, { rotationDeg: 90 })).rejects.toMatchObject({ status: 400 });
  });

  it("allows a rotationDeg change on an instance of a rotatable SKU", async () => {
    const design = await prisma.design.create({ data: { name: "Rotatable Fixture" } });
    designIdToCleanUp = design.id;
    const vanitySku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-VANITY-01" } });
    expect(vanitySku.rotatable).toBe(true);

    const instance = await createProductInstance(design.id, { skuId: vanitySku.id });
    const updated = await updateProductInstance(instance.id, { rotationDeg: 90 });
    expect(updated.rotationDeg).toBe(90);
  });

  it("does not reject an update that sets rotationDeg to its current value on a non-rotatable SKU (no-op is not a rotation)", async () => {
    const design = await prisma.design.create({ data: { name: "Non-Rotatable No-Op Fixture" } });
    designIdToCleanUp = design.id;
    const stoolSku = await prisma.skuMaster.findUniqueOrThrow({ where: { code: "SKU-FURN-STOOL-01" } });
    const instance = await createProductInstance(design.id, { skuId: stoolSku.id });

    const updated = await updateProductInstance(instance.id, { rotationDeg: 0, quantity: 2 });
    expect(updated.quantity).toBe(2);
  });
});
