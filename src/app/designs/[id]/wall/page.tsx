"use client";

import { use, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

const WallCanvas = dynamic(() => import("@/components/canvas/WallCanvas").then((m) => m.WallCanvas), {
  ssr: false,
});

export default function WallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });

  const wallNode = designQuery.data?.geometryNodes.find((n: { nodeType: string }) => n.nodeType === "WALL");

  const [wallType, setWallType] = useState<"STRAIGHT_LTR" | "STRAIGHT_RTL" | "L_TYPE">("STRAIGHT_LTR");
  const [lengthMm, setLengthMm] = useState(3000);
  const [heightMm, setHeightMm] = useState(2400);

  const mutation = useMutation({
    mutationFn: () => api.setWall(id, { wallType, lengthMm, heightMm }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", id] }),
  });

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Wall Configuration</h2>
        <div className="form-row">
          <div className="field">
            <label>Wall Type</label>
            <select value={wallType} onChange={(e) => setWallType(e.target.value as typeof wallType)}>
              <option value="STRAIGHT_LTR">Straight (Left → Right)</option>
              <option value="STRAIGHT_RTL">Straight (Right → Left)</option>
              <option value="L_TYPE">L-Type (90° corner)</option>
            </select>
          </div>
          <div className="field">
            <label>Length (mm)</label>
            <input type="number" value={lengthMm} onChange={(e) => setLengthMm(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Height (mm)</label>
            <input type="number" value={heightMm} onChange={(e) => setHeightMm(Number(e.target.value))} />
          </div>
          <button className="btn" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {wallNode ? "Replace Wall" : "Create Wall"}
          </button>
        </div>
        {mutation.isError && <p className="issue-error">{(mutation.error as Error).message}</p>}
      </div>

      {wallNode?.wall && (
        <WallCanvas wall={wallNode.wall} edges={wallNode.edges} />
      )}
    </div>
  );
}
