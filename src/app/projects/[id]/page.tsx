"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ProjectInstancesSection } from "@/components/workspace/ProjectInstancesSection";
import { ProjectFinalBomSection } from "@/components/workspace/ProjectFinalBomSection";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectQuery = useQuery({ queryKey: ["project", id], queryFn: () => api.getProject(id) });

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>{projectQuery.data?.name ?? "Project"}</h1>
      {projectQuery.data && (
        <p style={{ color: "#888", marginBottom: 16 }}>
          From Template: {projectQuery.data.template.name} (v{projectQuery.data.template.version})
        </p>
      )}

      <ProjectInstancesSection projectId={id} />
      <ProjectFinalBomSection projectId={id} />
    </div>
  );
}
