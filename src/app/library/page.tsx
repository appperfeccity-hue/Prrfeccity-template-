"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export default function LibraryPage() {
  const libraryQuery = useQuery({ queryKey: ["library"], queryFn: api.listLibrary });

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>Design Library</h1>
      <p style={{ color: "#888", marginBottom: 16 }}>Published, validated Templates -- the latest version of each.</p>

      {libraryQuery.isLoading && <p>Loading…</p>}
      {libraryQuery.data?.map((design) => (
        <div key={design.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>{design.name}</strong>{" "}
            <span className="badge">v{design.version}</span>
            {design.description && <p style={{ color: "#888", fontSize: 13 }}>{design.description}</p>}
          </div>
          <Link className="btn btn-secondary" href={`/designs/${design.id}/bom`}>
            View
          </Link>
        </div>
      ))}
      {libraryQuery.data?.length === 0 && <p>No published templates yet.</p>}
    </div>
  );
}
