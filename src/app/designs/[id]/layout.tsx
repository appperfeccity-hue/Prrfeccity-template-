"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { WorkflowStepper } from "@/components/layout/WorkflowStepper";
import { UndoRedoProvider } from "@/lib/undo-redo";
import { UndoRedoToolbar } from "@/components/layout/UndoRedoToolbar";

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
    <UndoRedoProvider key={id}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h1>{designQuery.data?.name ?? "Loading…"}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {designQuery.data && (
              <span className="badge">
                {designQuery.data.status} · v{designQuery.data.version}
              </span>
            )}
            <UndoRedoToolbar />
          </div>
        </div>
        <WorkflowStepper designId={id} />
        {children}
      </div>
    </UndoRedoProvider>
  );
}
