"use client";

import { use, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

const FurnitureCanvas = dynamic(
  () => import("@/components/canvas/FurnitureCanvas").then((m) => m.FurnitureCanvas),
  { ssr: false },
);

export default function FurniturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const skusQuery = useQuery({ queryKey: ["skus", "FURNITURE"], queryFn: () => api.listSkus("FURNITURE") });

  const design = designQuery.data;
  const furnitureInstances = design?.productInstances.filter((pi) => pi.sku?.category === "FURNITURE") ?? [];

  const [selectedSkuId, setSelectedSkuId] = useState("");

  const placeMutation = useMutation({
    mutationFn: (coords: { x: number; y: number }) =>
      api.createProductInstance(id, { skuId: selectedSkuId, x: coords.x, y: coords.y }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", id] }),
  });

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Furniture</h2>
        <div className="form-row">
          <div className="field">
            <label>Furniture SKU</label>
            <select value={selectedSkuId} onChange={(e) => setSelectedSkuId(e.target.value)}>
              <option value="">Select…</option>
              {skusQuery.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <FurnitureCanvas
        instances={furnitureInstances}
        onPlace={(x, y) => {
          if (!selectedSkuId) return;
          placeMutation.mutate({ x, y });
        }}
      />
      {!selectedSkuId && <p style={{ color: "#888" }}>Select a furniture SKU above, then click on the canvas to place it.</p>}
    </div>
  );
}
