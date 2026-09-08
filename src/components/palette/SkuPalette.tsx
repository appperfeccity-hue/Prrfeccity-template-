"use client";

import type { SkuWithCategory } from "@/lib/api/client";

export const SKU_DRAG_MIME = "application/x-sku";

export type SkuDragPayload = {
  skuId: string;
  categoryKey: string;
  defaultWidthMm: number | null;
};

export function SkuPalette({
  skus,
  categoryFilter,
}: {
  skus: SkuWithCategory[];
  categoryFilter?: string;
}) {
  const filtered = categoryFilter ? skus.filter((s) => s.category.key === categoryFilter) : skus;

  return (
    <div className="card sku-palette">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>SKU Palette</h2>
      <p style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>Drag a SKU onto the canvas.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map((sku) => (
          <div
            key={sku.id}
            draggable
            onDragStart={(e) => {
              const payload: SkuDragPayload = {
                skuId: sku.id,
                categoryKey: sku.category.key,
                defaultWidthMm: sku.defaultWidthMm ?? null,
              };
              e.dataTransfer.setData(SKU_DRAG_MIME, JSON.stringify(payload));
              e.dataTransfer.effectAllowed = "copy";
            }}
            style={{
              border: "1px solid #ddd",
              borderRadius: 4,
              padding: "6px 10px",
              cursor: "grab",
              background: "#fff",
              fontSize: 12,
            }}
          >
            <strong>{sku.code}</strong>
            <div style={{ color: "#888" }}>
              {sku.name} · {sku.category.label}
              {sku.defaultWidthMm != null ? ` · ${sku.defaultWidthMm}mm` : ""}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={{ color: "#aaa", fontSize: 12 }}>No SKUs in this category.</p>}
      </div>
    </div>
  );
}
