import type { SkuWithCategory } from "@/lib/api/client";
import type {
  ProductInstanceEdgeModel as ProductInstanceEdge,
  ProductInstanceModel as ProductInstance,
  SkuEdgeModel as SkuEdge,
} from "@/generated/prisma/models";

export type SkuDetailWithEdges = SkuWithCategory & {
  edgesFrom: (SkuEdge & { toSku: SkuWithCategory })[];
};

export type SuggestedRelationship = {
  skuEdgeId: string;
  edgeType: SkuEdge["edgeType"];
  toSkuId: string;
  toSkuCode: string;
  toSkuName: string;
};

/**
 * Every catalog SkuEdge on `instance`'s SKU that isn't yet realized by an
 * outgoing ProductInstanceEdge from this instance -- mirrors the exact
 * satisfaction check validation.ts's REQUIRED_SKU_EDGES_SATISFIED rule uses
 * for REQUIRES, generalized to all SkuEdgeTypes since nothing here is
 * auto-created: every suggestion still needs an explicit "Add" click.
 */
export function computeSuggestedRelationships(
  instance: ProductInstance,
  skuDetail: SkuDetailWithEdges,
  existingEdges: ProductInstanceEdge[],
  productInstances: ProductInstance[],
): SuggestedRelationship[] {
  const skuIdByInstanceId = new Map(productInstances.map((pi) => [pi.id, pi.skuId]));

  return skuDetail.edgesFrom
    .filter((catalogEdge) => {
      const satisfied = existingEdges.some(
        (e) =>
          e.fromInstanceId === instance.id &&
          e.edgeType === catalogEdge.edgeType &&
          skuIdByInstanceId.get(e.toInstanceId) === catalogEdge.toSkuId,
      );
      return !satisfied;
    })
    .map((catalogEdge) => ({
      skuEdgeId: catalogEdge.id,
      edgeType: catalogEdge.edgeType,
      toSkuId: catalogEdge.toSkuId,
      toSkuCode: catalogEdge.toSku.code,
      toSkuName: catalogEdge.toSku.name,
    }));
}
