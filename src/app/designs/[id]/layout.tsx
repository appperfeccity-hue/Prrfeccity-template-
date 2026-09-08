"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { WorkflowStepper } from "@/components/layout/WorkflowStepper";

export default function DesignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1>{designQuery.data?.name ?? "Loading…"}</h1>
        {designQuery.data && (
          <span className="badge">
            {designQuery.data.status} · v{designQuery.data.version}
          </span>
        )}
      </div>
      <WorkflowStepper designId={id} />
      {children}
    </div>
  );
}
