"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { DesignStageSection } from "@/components/workspace/DesignStageSection";
import { WallFormPanel } from "@/components/workspace/WallFormPanel";
import { CreatePanel } from "@/components/workspace/CreatePanel";
import { ProductLinking } from "@/components/workspace/ProductLinking";

/**
 * Design workspace -- UI-M6b: the cutover. The old per-workflow sections
 * (WallSection/ZonesSection/ProductsSection/FurnitureSection) and their
 * WallCanvas/ZoneCanvas/FurnitureCanvas are gone -- DesignStage plus
 * WallFormPanel/CreatePanel/ProductLinking (UI-M6a) is now the sole
 * authoring surface, with full parity verified against the old stack.
 */
export default function DesignWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const isDraft = designQuery.data?.status === "DRAFT";

  return (
    <div className="flex flex-col gap-3">
      <WallFormPanel designId={id} isDraft={Boolean(isDraft)} />
      <DesignStageSection designId={id} />
      <CreatePanel designId={id} isDraft={Boolean(isDraft)} />
      <ProductLinking designId={id} isDraft={Boolean(isDraft)} />
    </div>
  );
}
