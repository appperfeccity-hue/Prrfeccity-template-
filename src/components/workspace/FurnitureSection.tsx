"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { SkuPalette, type SkuDragPayload } from "@/components/palette/SkuPalette";
import { useUndoRedo } from "@/lib/undo-redo";

const FurnitureCanvas = dynamic(
  () => import("@/components/canvas/FurnitureCanvas").then((m) => m.FurnitureCanvas),
  { ssr: false },
);

export function FurnitureSection({ designId: id }: { designId: string }) {
  const queryClient = useQueryClient();
  const { pushAction } = useUndoRedo();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const skusQuery = useQuery({ queryKey: ["skus", "FURNITURE"], queryFn: () => api.listSkus("FURNITURE") });

  const design = designQuery.data;
  const furnitureInstances = design?.productInstances.filter((pi) => pi.sku?.category.key === "FURNITURE") ?? [];

  const [selectedSkuId, setSelectedSkuId] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["design", id] });

  const placeMutation = useMutation({
    mutationFn: ({ skuId, x, y }: { skuId: string; x: number; y: number }) =>
      api.createProductInstance(id, { skuId, x, y }),
    onSuccess: (result, variables) => {
      invalidate();
      let currentId = result.id;
      pushAction({
        description: `Place furniture`,
        undo: async () => {
          await api.deleteProductInstance(id, currentId);
          invalidate();
        },
        redo: async () => {
          const r = await api.createProductInstance(id, variables);
          currentId = r.id;
          invalidate();
        },
      });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ instanceId, x, y }: { instanceId: string; x: number; y: number; previousX: number; previousY: number }) =>
      api.updateProductInstance(id, instanceId, { x, y }),
    onSuccess: (_result, variables) => {
      invalidate();
      pushAction({
        description: `Move furniture`,
        undo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { x: variables.previousX, y: variables.previousY });
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { x: variables.x, y: variables.y });
          invalidate();
        },
      });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: ({ instanceId, rotationDeg }: { instanceId: string; rotationDeg: number; previousRotationDeg: number }) =>
      api.updateProductInstance(id, instanceId, { rotationDeg }),
    onSuccess: (_result, variables) => {
      invalidate();
      pushAction({
        description: `Rotate furniture`,
        undo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { rotationDeg: variables.previousRotationDeg });
          invalidate();
        },
        redo: async () => {
          await api.updateProductInstance(id, variables.instanceId, { rotationDeg: variables.rotationDeg });
          invalidate();
        },
      });
    },
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

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <FurnitureCanvas
          instances={furnitureInstances}
          onPlace={(x, y) => {
            if (!selectedSkuId) return;
            placeMutation.mutate({ skuId: selectedSkuId, x, y });
          }}
          onDropSku={(payload: SkuDragPayload, x, y) => {
            if (payload.categoryKey !== "FURNITURE") {
              alert("Only FURNITURE category SKUs can be dropped here.");
              return;
            }
            placeMutation.mutate({ skuId: payload.skuId, x, y });
          }}
          onMove={(instanceId, x, y) => {
            const inst = furnitureInstances.find((i) => i.id === instanceId);
            if (!inst) return;
            moveMutation.mutate({ instanceId, x, y, previousX: inst.x ?? 0, previousY: inst.y ?? 0 });
          }}
          onRotate={(instanceId, rotationDeg) => {
            const inst = furnitureInstances.find((i) => i.id === instanceId);
            if (!inst) return;
            rotateMutation.mutate({ instanceId, rotationDeg, previousRotationDeg: inst.rotationDeg ?? 0 });
          }}
        />
        <SkuPalette skus={skusQuery.data ?? []} categoryFilter="FURNITURE" />
      </div>
      {!selectedSkuId && <p style={{ color: "#888" }}>Select a furniture SKU above and click on the canvas, or drag a SKU from the palette, to place it.</p>}
    </div>
  );
}
