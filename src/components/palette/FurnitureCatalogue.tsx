"use client";

import { useState } from "react";
import type { SkuWithCategory } from "@/lib/api/client";

export type ArmedFurniture = {
  skuId: string;
  designOptionId?: string;
  colourOptionId?: string;
  sizeOptionId?: string;
};

/**
 * Furniture Catalogue selection flow: Product -> Design -> Colour -> Size ->
 * Add to Canvas -> Position. Furniture is an add-on picked from the
 * catalogue, not free-form geometry -- there is no draggable furniture
 * palette entry and no bare SKU pick with no configuration; every placement
 * carries an approved SKU + Design + Colour + Size combination.
 *
 * "Add to Canvas" arms placement rather than dropping at a default position
 * -- Position stays the Designer's next explicit step, using the same
 * click-to-place-on-canvas interaction the app already had.
 */
export function FurnitureCatalogue({
  skus,
  armed,
  onArm,
}: {
  skus: SkuWithCategory[];
  armed: ArmedFurniture | null;
  onArm: (armed: ArmedFurniture) => void;
}) {
  const [skuId, setSkuId] = useState("");
  const [designOptionId, setDesignOptionId] = useState("");
  const [colourOptionId, setColourOptionId] = useState("");
  const [sizeOptionId, setSizeOptionId] = useState("");

  const sku = skus.find((s) => s.id === skuId);

  const handleSkuChange = (nextSkuId: string) => {
    setSkuId(nextSkuId);
    const next = skus.find((s) => s.id === nextSkuId);
    setDesignOptionId(next?.designOptions[0]?.id ?? "");
    setColourOptionId(next?.colourOptions[0]?.id ?? "");
    setSizeOptionId(next?.sizeOptions[0]?.id ?? "");
  };

  const canAdd = Boolean(sku) && (sku!.sizeOptions.length === 0 || Boolean(sizeOptionId));

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Furniture Catalogue</h2>
      <p style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
        Select a product and its configuration, then Add to Canvas and click the canvas to position it.
      </p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/50">Product</span>
          <select value={skuId} onChange={(e) => handleSkuChange(e.target.value)}>
            <option value="">Select…</option>
            {skus.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </label>

        {sku && sku.designOptions.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/50">Design</span>
            <select value={designOptionId} onChange={(e) => setDesignOptionId(e.target.value)}>
              {sku.designOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {sku && sku.colourOptions.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/50">Colour</span>
            <select value={colourOptionId} onChange={(e) => setColourOptionId(e.target.value)}>
              {sku.colourOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {sku && sku.sizeOptions.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-foreground/50">Size</span>
            <select value={sizeOptionId} onChange={(e) => setSizeOptionId(e.target.value)}>
              {sku.sizeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} ({o.widthMm}×{o.depthMm}×{o.heightMm}mm)
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className="btn"
          disabled={!canAdd}
          onClick={() => {
            if (!sku) return;
            onArm({
              skuId,
              designOptionId: designOptionId || undefined,
              colourOptionId: colourOptionId || undefined,
              sizeOptionId: sizeOptionId || undefined,
            });
          }}
        >
          Add to Canvas
        </button>
        {armed && armed.skuId === skuId && (
          <p className="text-green-600 text-xs">Armed — click the canvas to position it.</p>
        )}
        {skus.length === 0 && <p style={{ color: "#aaa", fontSize: 12 }}>No furniture products in the catalogue.</p>}
      </div>
    </div>
  );
}
