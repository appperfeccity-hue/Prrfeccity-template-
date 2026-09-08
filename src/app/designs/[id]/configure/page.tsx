"use client";

import { use } from "react";
import { PermissionsSection } from "@/components/workspace/PermissionsSection";

/**
 * Configure workspace -- UI-M3 lands the shell with the prior Permissions
 * page content as-is. UI-M7 regroups it by TemplateParameter.paramType
 * (parameters / consultant permissions / SKU substitutions / manufacturing
 * constraints / edge treatments all being views over the same one feature)
 * and adds the read-only Product Dependencies catalog reference view.
 */
export default function ConfigureWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div>
      <PermissionsSection designId={id} />
    </div>
  );
}
