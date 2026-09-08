"use client";

import { use } from "react";
import { ValidateSection } from "@/components/workspace/ValidateSection";
import { BomSection } from "@/components/workspace/BomSection";
import { PublishSection } from "@/components/workspace/PublishSection";

/**
 * Review workspace -- UI-M3 lands the shell with the prior Validate/Master
 * BOM/Publish pages stacked as-is. UI-M8 replaces the top two with the
 * BottomDrawer's Validation/Live BOM tabs (expanded to full width here)
 * plus an Activity tab; the publish gate logic is reused unchanged.
 */
export default function ReviewWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-2">Validation</h2>
        <ValidateSection designId={id} />
      </section>
      <section>
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-2">Master BOM</h2>
        <BomSection designId={id} />
      </section>
      <section>
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-2">Publish</h2>
        <PublishSection designId={id} />
      </section>
    </div>
  );
}
