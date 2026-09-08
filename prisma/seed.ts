import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { SkuCategory, SkuEdgeType } from "../src/generated/prisma/client";

type SkuSeed = {
  code: string;
  name: string;
  category: SkuCategory;
  defaultWidthMm?: number;
  defaultUnit?: string;
};

const skus: SkuSeed[] = [
  { code: "SKU-PANEL-600", name: "Wall Panel 600mm", category: "PRIMARY", defaultWidthMm: 600 },
  { code: "SKU-PANEL-300", name: "Wall Panel 300mm", category: "PRIMARY", defaultWidthMm: 300 },
  { code: "SKU-PVC-BACK-01", name: "PVC Back Sheet", category: "STRUCTURAL" },
  { code: "SKU-CONNECTOR-H", name: "Horizontal Connector", category: "CONNECTION" },
  { code: "SKU-TRIM-EDGE-01", name: "Edge Trim", category: "CONNECTION" },
  { code: "SKU-DECOR-PROFILE-01", name: "Decorative Profile", category: "DECORATIVE" },
  { code: "SKU-COVE-LIGHT-LED", name: "Cove Light (LED)", category: "FUNCTIONAL" },
  { code: "SKU-HW-SCREWKIT-01", name: "Screw & Hardware Kit", category: "INSTALLATION" },
  { code: "SKU-FURN-VANITY-01", name: "Vanity Unit", category: "FURNITURE" },
];

const skuEdges: { from: string; to: string; edgeType: SkuEdgeType }[] = [
  { from: "SKU-PANEL-600", to: "SKU-PVC-BACK-01", edgeType: "REQUIRES" },
  { from: "SKU-PANEL-300", to: "SKU-PVC-BACK-01", edgeType: "REQUIRES" },
  { from: "SKU-PANEL-600", to: "SKU-CONNECTOR-H", edgeType: "REQUIRES" },
  { from: "SKU-PANEL-600", to: "SKU-TRIM-EDGE-01", edgeType: "TERMINATES" },
  { from: "SKU-PVC-BACK-01", to: "SKU-COVE-LIGHT-LED", edgeType: "SUPPORTS" },
  { from: "SKU-PANEL-600", to: "SKU-DECOR-PROFILE-01", edgeType: "INTERACTS" },
];

async function main() {
  const skuIdByCode = new Map<string, string>();

  for (const sku of skus) {
    const row = await prisma.skuMaster.upsert({
      where: { code: sku.code },
      update: {
        name: sku.name,
        category: sku.category,
        defaultWidthMm: sku.defaultWidthMm,
        defaultUnit: sku.defaultUnit ?? "EA",
      },
      create: {
        code: sku.code,
        name: sku.name,
        category: sku.category,
        defaultWidthMm: sku.defaultWidthMm,
        defaultUnit: sku.defaultUnit ?? "EA",
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

  console.log(`Seeded ${skus.length} SKUs and ${skuEdges.length} SKU edges.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
