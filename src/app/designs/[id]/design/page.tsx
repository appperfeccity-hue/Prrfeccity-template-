"use client";

import { use } from "react";
import { WallSection } from "@/components/workspace/WallSection";
import { ZonesSection } from "@/components/workspace/ZonesSection";
import { ProductsSection } from "@/components/workspace/ProductsSection";
import { FurnitureSection } from "@/components/workspace/FurnitureSection";

/**
 * Design workspace -- UI-M3: the shell/routing restructure lands first, with
 * the four prior tab pages (Wall/Zones & Panels/Products/Furniture) stacked
 * here as-is (each still mounting its own old WallCanvas/ZoneCanvas/
 * FurnitureCanvas) so nothing regresses. UI-M4 replaces this stack with the
 * unified DesignStage; these Section components' mutations/state are kept
 * and reused as-is at that point too, only their canvas rendering changes.
 */
export default function DesignWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div className="flex flex-col gap-8">
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
