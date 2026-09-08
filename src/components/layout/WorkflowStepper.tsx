"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = [
  { slug: "wall", label: "Wall" },
  { slug: "zones", label: "Zones & Panels" },
  { slug: "products", label: "Products" },
  { slug: "furniture", label: "Furniture" },
  { slug: "validate", label: "Validate" },
  { slug: "permissions", label: "Permissions" },
  { slug: "bom", label: "Master BOM" },
  { slug: "publish", label: "Publish" },
];

export function WorkflowStepper({ designId }: { designId: string }) {
  const pathname = usePathname();

  return (
    <nav className="stepper">
      {STEPS.map((step) => {
        const href = `/designs/${designId}/${step.slug}`;
        const active = pathname?.startsWith(href);
        return (
          <Link key={step.slug} href={href} className={active ? "active" : ""}>
            {step.label}
          </Link>
        );
      })}
    </nav>
  );
}
