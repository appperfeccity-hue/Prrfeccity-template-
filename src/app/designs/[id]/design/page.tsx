"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { WallSection } from "@/components/workspace/WallSection";
import { ZonesSection } from "@/components/workspace/ZonesSection";
import { ProductsSection } from "@/components/workspace/ProductsSection";
import { FurnitureSection } from "@/components/workspace/FurnitureSection";
import { DesignStageSection } from "@/components/workspace/DesignStageSection";
import { WallFormPanel } from "@/components/workspace/WallFormPanel";
import { CreatePanel } from "@/components/workspace/CreatePanel";
import { ProductLinking } from "@/components/workspace/ProductLinking";

/**
 * Design workspace -- UI-M6a: the unified stack now has its own Wall form,
 * Create panel (zone/partition/panel/zone-relationship), and product
 * placement/linking panel, ported near-verbatim from the old
 * WallSection/ZonesSection/ProductsSection so the unified canvas has full
 * parity with the old per-workflow sections (furniture already had full
 * parity as of UI-M4/M5 via DesignStageSection + FurnitureCatalogue). The
 * old four sections stay mounted below for the parallel-verification window
 * -- UI-M6b removes them once parity is confirmed end-to-end.
 */
export default function DesignWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const isDraft = designQuery.data?.status === "DRAFT";

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-2">
          Unified Canvas (preview)
        </h2>
        <p className="text-xs text-foreground/50 mb-2">
          UI-M6a: the unified stack now includes Wall setup, Create (zone/partition/panel/relationship), and Product
          placement/linking, ported from the sections below. Shown here for comparison before the old sections are
          removed. Renders the same design graph -- try zoom/pan, selecting a zone/partition/panel/edge, dragging a
          SKU from the palette, and moving/rotating furniture.
        </p>
        <div className="flex flex-col gap-3">
          <WallFormPanel designId={id} isDraft={Boolean(isDraft)} />
          <DesignStageSection designId={id} />
          <CreatePanel designId={id} isDraft={Boolean(isDraft)} />
          <ProductLinking designId={id} isDraft={Boolean(isDraft)} />
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-2">Wall</h2>
        <WallSection designId={id} />
      </section>
      <section>
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-2">Zones &amp; Panels</h2>
        <ZonesSection designId={id} />
      </section>
      <section>
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-2">Products</h2>
        <ProductsSection designId={id} />
      </section>
      <section>
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-2">Furniture</h2>
        <FurnitureSection designId={id} />
      </section>
    </div>
  );
}
