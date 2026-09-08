"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const WORKSPACES = [
  { slug: "design", label: "Design" },
  { slug: "configure", label: "Configure" },
  { slug: "review", label: "Review" },
];

export function WorkspaceTabs({ designId }: { designId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-black/10 dark:border-white/10 mb-5">
      {WORKSPACES.map((ws) => {
        const href = `/designs/${designId}/${ws.slug}`;
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={ws.slug}
            href={href}
            className={`px-4 py-2 text-sm font-medium rounded-t-token-md -mb-px border-b-2 ${
              active
                ? "border-accent text-accent"
                : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {ws.label}
          </Link>
        );
      })}
    </nav>
  );
}
