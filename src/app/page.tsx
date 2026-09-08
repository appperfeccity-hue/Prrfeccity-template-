"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export default function DesignsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const designsQuery = useQuery({ queryKey: ["designs"], queryFn: api.listDesigns });
  const createMutation = useMutation({
    mutationFn: () => api.createDesign({ name }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["designs"] });
    },
  });

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>Designs</h1>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>New Template</h2>
        <div className="form-row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bathroom Panel System A" />
          </div>
          <button
            className="btn"
            disabled={!name || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create
          </button>
        </div>
        {createMutation.isError && (
          <p className="issue-error">{(createMutation.error as Error).message}</p>
        )}
      </div>

      {designsQuery.isLoading && <p>Loading…</p>}
      {designsQuery.data?.map((design) => (
        <div key={design.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>{design.name}</strong>{" "}
            <span className="badge">{design.status}</span>{" "}
            <span style={{ color: "#888", fontSize: 13 }}>v{design.version}</span>
          </div>
          <Link className="btn btn-secondary" href={`/designs/${design.id}/wall`}>
            Open
          </Link>
        </div>
      ))}
      {designsQuery.data?.length === 0 && <p>No designs yet -- create one above.</p>}
    </div>
  );
}
