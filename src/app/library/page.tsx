"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type LibraryRoomTypeValue } from "@/lib/api/client";

const ROOM_TILES: { value: LibraryRoomTypeValue; label: string; color: string }[] = [
  { value: "LIVING_ROOM", label: "Living room", color: "#8a7360" },
  { value: "TV_UNIT", label: "TV unit", color: "#4a4640" },
  { value: "BEDROOM", label: "Bedroom", color: "#6b5b4d" },
];

const AREA_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< 2150 sq ft", min: 0, max: 2150 },
  { label: "2150–4200 sq ft", min: 2150, max: 4200 },
  { label: "> 4200 sq ft", min: 4200, max: Infinity },
];

export default function LibraryPage() {
  const queryClient = useQueryClient();
  const libraryQuery = useQuery({ queryKey: ["library"], queryFn: () => api.listLibrary() });
  const looksQuery = useQuery({ queryKey: ["looks"], queryFn: () => api.listLooks() });

  const [roomFilter, setRoomFilter] = useState<LibraryRoomTypeValue | null>(null);
  const [lookFilter, setLookFilter] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<{ label: string; min: number; max: number } | null>(null);

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorited }: { id: string; isFavorited: boolean }) => api.updateDesign(id, { isFavorited }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["library"] }),
  });

  const designs = (libraryQuery.data ?? []).filter((d) => {
    if (roomFilter && d.libraryRoomType !== roomFilter) return false;
    if (lookFilter && d.lookId !== lookFilter) return false;
    if (areaFilter && (d.areaSqFt == null || d.areaSqFt < areaFilter.min || d.areaSqFt >= areaFilter.max)) return false;
    return true;
  });

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>Explore designs for</h1>
      <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
        {ROOM_TILES.map((tile) => (
          <button
            key={tile.value}
            onClick={() => setRoomFilter(roomFilter === tile.value ? null : tile.value)}
            style={{
              cursor: "pointer",
              border: roomFilter === tile.value ? "2px solid #171717" : "2px solid transparent",
              borderRadius: 10,
              padding: 0,
              background: "none",
              textAlign: "left",
            }}
          >
            <div style={{ width: 160, height: 110, borderRadius: 8, background: tile.color }} />
            <p style={{ marginTop: 6, fontSize: 14 }}>{tile.label}</p>
          </button>
        ))}
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Explore all looks</h2>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {looksQuery.data?.map((look) => (
          <button
            key={look.id}
            onClick={() => setLookFilter(lookFilter === look.id ? null : look.id)}
            style={{
              cursor: "pointer",
              border: lookFilter === look.id ? "2px solid #171717" : "2px solid transparent",
              borderRadius: 10,
              padding: 0,
              background: "none",
              textAlign: "center",
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: 8, background: look.swatchColor }} />
            <p style={{ marginTop: 4, fontSize: 12, color: "#666" }}>{look.label}</p>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {ROOM_TILES.map((tile) => (
          <button
            key={tile.value}
            className="btn btn-secondary"
            style={roomFilter === tile.value ? { background: "#171717", color: "#fff" } : undefined}
            onClick={() => setRoomFilter(roomFilter === tile.value ? null : tile.value)}
          >
            {tile.label}
          </button>
        ))}
        {AREA_BUCKETS.map((bucket) => (
          <button
            key={bucket.label}
            className="btn btn-secondary"
            style={areaFilter?.label === bucket.label ? { background: "#171717", color: "#fff" } : undefined}
            onClick={() => setAreaFilter(areaFilter?.label === bucket.label ? null : bucket)}
          >
            {bucket.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 20,
        }}
      >
        {designs.map((design) => (
          <div key={design.id} style={{ position: "relative" }}>
            <a href={`/designs/${design.id}/bom`} style={{ display: "block" }}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 10,
                  background: design.look?.swatchColor ?? "#e2e2e2",
                }}
              />
            </a>
            <button
              onClick={() => favoriteMutation.mutate({ id: design.id, isFavorited: !design.isFavorited })}
              aria-label="Toggle favorite"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "rgba(255,255,255,0.9)",
                border: "none",
                borderRadius: "50%",
                width: 28,
                height: 28,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {design.isFavorited ? "♥" : "♡"}
            </button>
            <p style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>{design.name}</p>
            {design.pricePerSqFt != null && (
              <p style={{ color: "#888", fontSize: 12 }}>Approx. ₹{design.pricePerSqFt}/sq ft</p>
            )}
          </div>
        ))}
      </div>
      {designs.length === 0 && <p style={{ color: "#888" }}>No published templates match these filters.</p>}
    </div>
  );
}
