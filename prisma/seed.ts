import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { SkuEdgeType } from "../src/generated/prisma/client";

const categories: { key: string; label: string }[] = [
  { key: "PRIMARY", label: "Primary" },
  { key: "STRUCTURAL", label: "Structural" },
  { key: "CONNECTION", label: "Connection" },
  { key: "DECORATIVE", label: "Decorative" },
  { key: "FUNCTIONAL", label: "Functional" },
  { key: "INSTALLATION", label: "Installation" },
  { key: "FURNITURE", label: "Furniture" },
];

type SkuSeed = {
  code: string;
  name: string;
  categoryKey: string;
  defaultWidthMm?: number;
  defaultUnit?: string;
  minCutPieceMm?: number;
  rotatable?: boolean;
};

const skus: SkuSeed[] = [
  { code: "SKU-PANEL-600", name: "Wall Panel 600mm", categoryKey: "PRIMARY", defaultWidthMm: 600, minCutPieceMm: 100 },
  { code: "SKU-PANEL-300", name: "Wall Panel 300mm", categoryKey: "PRIMARY", defaultWidthMm: 300, minCutPieceMm: 100 },
  { code: "SKU-PVC-BACK-01", name: "PVC Back Sheet", categoryKey: "STRUCTURAL" },
  { code: "SKU-CONNECTOR-H", name: "Horizontal Connector", categoryKey: "CONNECTION" },
  { code: "SKU-TRIM-EDGE-01", name: "Edge Trim", categoryKey: "CONNECTION" },
  { code: "SKU-DECOR-PROFILE-01", name: "Decorative Profile", categoryKey: "DECORATIVE" },
  { code: "SKU-COVE-LIGHT-LED", name: "Cove Light (LED)", categoryKey: "FUNCTIONAL" },
  { code: "SKU-HW-SCREWKIT-01", name: "Screw & Hardware Kit", categoryKey: "INSTALLATION" },
  // Furniture Catalogue items: rotatable defaults true unless the physical
  // product is fixed/wall-mounted. SKU-FURN-STOOL-01 is seeded non-rotatable
  // specifically so the "Rotate only if permitted" rule has a real product
  // to exercise/test against, without changing the vanity's behavior.
  { code: "SKU-FURN-VANITY-01", name: "Vanity Unit", categoryKey: "FURNITURE", rotatable: true },
  { code: "SKU-FURN-STOOL-01", name: "Accent Stool", categoryKey: "FURNITURE", rotatable: false },
];

type FurnitureOptionsSeed = {
  skuCode: string;
  designs: { key: string; label: string }[];
  colours: { key: string; label: string; swatchColor: string }[];
  sizes: { key: string; label: string; widthMm: number; depthMm: number; heightMm: number }[];
};

const furnitureOptions: FurnitureOptionsSeed[] = [
  {
    skuCode: "SKU-FURN-VANITY-01",
    designs: [
      { key: "CLASSIC", label: "Classic" },
      { key: "MODERN", label: "Modern" },
    ],
    colours: [
      { key: "WHITE", label: "White", swatchColor: "#ffffff" },
      { key: "WALNUT", label: "Walnut", swatchColor: "#5c4030" },
    ],
    sizes: [
      { key: "SMALL", label: "Small", widthMm: 600, depthMm: 450, heightMm: 850 },
      { key: "LARGE", label: "Large", widthMm: 900, depthMm: 450, heightMm: 850 },
    ],
  },
  {
    skuCode: "SKU-FURN-STOOL-01",
    designs: [{ key: "ROUND", label: "Round" }],
    colours: [
      { key: "BLACK", label: "Black", swatchColor: "#1a1a1a" },
      { key: "OAK", label: "Oak", swatchColor: "#c9a86a" },
    ],
    sizes: [{ key: "STANDARD", label: "Standard", widthMm: 350, depthMm: 350, heightMm: 450 }],
  },
];

const looks: { key: string; label: string; swatchColor: string }[] = [
  { key: "MARBLE_LIGHT", label: "Marble", swatchColor: "#d8c9b0" },
  { key: "MARBLE_DARK", label: "Marble", swatchColor: "#3a2f28" },
  { key: "WOODEN", label: "Wooden", swatchColor: "#5c4030" },
  { key: "FABRIC", label: "Fabric", swatchColor: "#c9c2b5" },
  { key: "WASLITE", label: "Waslite", swatchColor: "#dbe4e6" },
  { key: "GREY", label: "Grey", swatchColor: "#8b93a0" },
];

const skuEdges: { from: string; to: string; edgeType: SkuEdgeType }[] = [
  { from: "SKU-PANEL-600", to: "SKU-PVC-BACK-01", edgeType: "REQUIRES" },
  { from: "SKU-PANEL-300", to: "SKU-PVC-BACK-01", edgeType: "REQUIRES" },
  { from: "SKU-PANEL-600", to: "SKU-CONNECTOR-H", edgeType: "REQUIRES" },
  { from: "SKU-PANEL-600", to: "SKU-TRIM-EDGE-01", edgeType: "TERMINATES_WITH" },
  { from: "SKU-PVC-BACK-01", to: "SKU-COVE-LIGHT-LED", edgeType: "SUPPORTS" },
  { from: "SKU-PANEL-600", to: "SKU-DECOR-PROFILE-01", edgeType: "INTERACTS_WITH" },
];

async function main() {
  const categoryIdByKey = new Map<string, string>();

  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { key: category.key },
      update: { label: category.label },
      create: { key: category.key, label: category.label },
    });
    categoryIdByKey.set(category.key, row.id);
  }

  const skuIdByCode = new Map<string, string>();

  for (const sku of skus) {
    const categoryId = categoryIdByKey.get(sku.categoryKey)!;
    const row = await prisma.skuMaster.upsert({
      where: { code: sku.code },
      update: {
        name: sku.name,
        categoryId,
        defaultWidthMm: sku.defaultWidthMm,
        defaultUnit: sku.defaultUnit ?? "EA",
        minCutPieceMm: sku.minCutPieceMm,
        rotatable: sku.rotatable ?? true,
      },
      create: {
        code: sku.code,
        name: sku.name,
        categoryId,
        defaultWidthMm: sku.defaultWidthMm,
        defaultUnit: sku.defaultUnit ?? "EA",
        minCutPieceMm: sku.minCutPieceMm,
        rotatable: sku.rotatable ?? true,
      },
    });
    skuIdByCode.set(sku.code, row.id);

    // Backfill the version-1 snapshot every SkuMaster needs a valid
    // currentVersion to point at -- mirrors row.currentVersion (always 1 for
    // seed data; PATCH /api/skus/[id] is the only thing that ever bumps it).
    await prisma.skuMasterVersion.upsert({
      where: { skuId_version: { skuId: row.id, version: row.currentVersion } },
      update: {
        code: row.code,
        name: row.name,
        categoryId: row.categoryId,
        defaultWidthMm: row.defaultWidthMm,
        defaultUnit: row.defaultUnit,
        minCutPieceMm: row.minCutPieceMm,
        attributes: row.attributes ?? undefined,
        rotatable: row.rotatable,
      },
      create: {
        skuId: row.id,
        version: row.currentVersion,
        code: row.code,
        name: row.name,
        categoryId: row.categoryId,
        defaultWidthMm: row.defaultWidthMm,
        defaultUnit: row.defaultUnit,
        minCutPieceMm: row.minCutPieceMm,
        attributes: row.attributes ?? undefined,
        rotatable: row.rotatable,
      },
    });
  }

  for (const entry of furnitureOptions) {
    const skuId = skuIdByCode.get(entry.skuCode)!;

    for (const d of entry.designs) {
      await prisma.furnitureDesignOption.upsert({
        where: { skuId_key: { skuId, key: d.key } },
        update: { label: d.label },
        create: { skuId, key: d.key, label: d.label },
      });
    }
    for (const c of entry.colours) {
      await prisma.furnitureColourOption.upsert({
        where: { skuId_key: { skuId, key: c.key } },
        update: { label: c.label, swatchColor: c.swatchColor },
        create: { skuId, key: c.key, label: c.label, swatchColor: c.swatchColor },
      });
    }
    for (const s of entry.sizes) {
      await prisma.furnitureSizeOption.upsert({
        where: { skuId_key: { skuId, key: s.key } },
        update: { label: s.label, widthMm: s.widthMm, depthMm: s.depthMm, heightMm: s.heightMm },
        create: { skuId, key: s.key, label: s.label, widthMm: s.widthMm, depthMm: s.depthMm, heightMm: s.heightMm },
      });
    }
  }

  for (const edge of skuEdges) {
    const fromSkuId = skuIdByCode.get(edge.from)!;
    const toSkuId = skuIdByCode.get(edge.to)!;

    const existing = await prisma.skuEdge.findFirst({
      where: { fromSkuId, toSkuId, edgeType: edge.edgeType },
    });
    if (!existing) {
      await prisma.skuEdge.create({
        data: { fromSkuId, toSkuId, edgeType: edge.edgeType },
      });
    }
  }

  for (const look of looks) {
    await prisma.look.upsert({
      where: { key: look.key },
      update: { label: look.label, swatchColor: look.swatchColor },
      create: { key: look.key, label: look.label, swatchColor: look.swatchColor },
    });
  }

  const optionCounts = furnitureOptions.reduce(
    (acc, e) => ({
      designs: acc.designs + e.designs.length,
      colours: acc.colours + e.colours.length,
      sizes: acc.sizes + e.sizes.length,
    }),
    { designs: 0, colours: 0, sizes: 0 },
  );

  console.log(
    `Seeded ${categories.length} categories, ${skus.length} SKUs, ${skuEdges.length} SKU edges, ${looks.length} looks, ` +
      `${optionCounts.designs} design options, ${optionCounts.colours} colour options, ${optionCounts.sizes} size options.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
