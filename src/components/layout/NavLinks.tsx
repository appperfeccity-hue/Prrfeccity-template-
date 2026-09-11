"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

// The Projects link is cosmetically hidden for Designers -- a convenience,
// not the enforcement. Every /api/projects/** route separately enforces
// requireRole(["ADMIN","CONSULTANT"]) server-side regardless of what this
// nav shows, matching "UI visibility is not authorization."
export function NavLinks() {
  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => api.getMe(), retry: false });
  const showProjects = meQuery.data?.role === "ADMIN" || meQuery.data?.role === "CONSULTANT";

  return (
    <nav>
      <Link href="/">Designs</Link>
      <Link href="/library">Design Library</Link>
      {showProjects && <Link href="/projects">Projects</Link>}
    </nav>
  );
}
