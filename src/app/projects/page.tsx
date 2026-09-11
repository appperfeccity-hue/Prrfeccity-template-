"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const libraryQuery = useQuery({ queryKey: ["library"], queryFn: api.listLibrary });

  const createMutation = useMutation({
    mutationFn: () => api.createProject({ name, templateId }),
    onSuccess: () => {
      setName("");
      setTemplateId("");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>Projects</h1>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>New Project</h2>
        <div className="form-row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 123 Oak Street Bathroom" />
          </div>
          <div className="field">
            <label>From Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Select a published Template…</option>
              {libraryQuery.data?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} (v{template.version})
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn"
            disabled={!name || !templateId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create
          </button>
        </div>
        {createMutation.isError && <p className="issue-error">{(createMutation.error as Error).message}</p>}
      </div>

      {projectsQuery.isLoading && <p>Loading…</p>}
      {projectsQuery.data?.map((project) => (
        <div
          key={project.id}
          className="card"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div>
            <strong>{project.name}</strong>{" "}
            <span style={{ color: "#888", fontSize: 13 }}>from {project.template.name}</span>
          </div>
          <Link className="btn btn-secondary" href={`/projects/${project.id}`}>
            Open
          </Link>
        </div>
      ))}
      {projectsQuery.data?.length === 0 && <p>No Projects yet -- create one from a published Template above.</p>}
    </div>
  );
}
