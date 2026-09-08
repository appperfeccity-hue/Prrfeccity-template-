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
  { code: "SKU-FURN-VANITY-01", name: "Vanity Unit", categoryKey: "FURNITURE" },
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
      },
      create: {
        code: sku.code,
        name: sku.name,
        categoryId,
        defaultWidthMm: sku.defaultWidthMm,
        defaultUnit: sku.defaultUnit ?? "EA",
        minCutPieceMm: sku.minCutPieceMm,
      },
    });
    skuIdByCode.set(sku.code, row.id);
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

  console.log(`Seeded ${categories.length} categories, ${skus.length} SKUs, ${skuEdges.length} SKU edges.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
