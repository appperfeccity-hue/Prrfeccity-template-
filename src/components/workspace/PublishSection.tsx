"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FullDesign, type Look, type LibraryRoomTypeValue } from "@/lib/api/client";

const ROOM_TYPES: { value: LibraryRoomTypeValue; label: string }[] = [
  { value: "LIVING_ROOM", label: "Living room" },
  { value: "TV_UNIT", label: "TV unit" },
  { value: "BEDROOM", label: "Bedroom" },
];

function LibraryListingForm({ id, design, looks }: { id: string; design: FullDesign; looks: Look[] }) {
  const queryClient = useQueryClient();
  const [roomType, setRoomType] = useState<LibraryRoomTypeValue | "">(
    (design.libraryRoomType as LibraryRoomTypeValue | null) ?? "",
  );
  const [lookId, setLookId] = useState(design.lookId ?? "");
  const [pricePerSqFt, setPricePerSqFt] = useState(design.pricePerSqFt != null ? String(design.pricePerSqFt) : "");
  const [areaSqFt, setAreaSqFt] = useState(design.areaSqFt != null ? String(design.areaSqFt) : "");

  const saveListingMutation = useMutation({
    mutationFn: () =>
      api.updateDesign(id, {
        libraryRoomType: roomType || null,
        lookId: lookId || null,
        pricePerSqFt: pricePerSqFt === "" ? null : Number(pricePerSqFt),
        areaSqFt: areaSqFt === "" ? null : Number(areaSqFt),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", id] }),
  });

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Library Listing</h2>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>
        How this Template appears in the Design Library. Editable before or after publishing.
      </p>
      <div className="form-row">
        <div className="field">
          <label>Room Type</label>
          <select value={roomType} onChange={(e) => setRoomType(e.target.value as LibraryRoomTypeValue | "")}>
            <option value="">None</option>
            {ROOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Look</label>
          <select value={lookId} onChange={(e) => setLookId(e.target.value)}>
            <option value="">None</option>
            {looks.map((look) => (
              <option key={look.id} value={look.id}>
                {look.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Price per sq ft</label>
          <input type="number" value={pricePerSqFt} onChange={(e) => setPricePerSqFt(e.target.value)} />
        </div>
        <div className="field">
          <label>Area (sq ft)</label>
          <input type="number" value={areaSqFt} onChange={(e) => setAreaSqFt(e.target.value)} />
        </div>
        <button className="btn btn-secondary" disabled={saveListingMutation.isPending} onClick={() => saveListingMutation.mutate()}>
          Save
        </button>
      </div>
      {saveListingMutation.isError && <p className="issue-error">{(saveListingMutation.error as Error).message}</p>}
    </div>
  );
}

export function PublishSection({ designId: id }: { designId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: ["design", id], queryFn: () => api.getDesign(id) });
  const looksQuery = useQuery({ queryKey: ["looks"], queryFn: () => api.listLooks() });

  const design = designQuery.data;
  const validationPassed = design?.validationResults[0]?.passed === true;
  const hasBom = (design?.masterBoms.length ?? 0) > 0;
  const isDraft = design?.status === "DRAFT";
  const isPublished = design?.status === "PUBLISHED";

  const publishMutation = useMutation({
    mutationFn: () => api.publish(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["design", id] }),
  });

  const reviseMutation = useMutation({
    mutationFn: () => api.reviseDesign(id),
    onSuccess: (child) => {
      queryClient.invalidateQueries({ queryKey: ["designs"] });
      router.push(`/designs/${child.id}/design`);
    },
  });

  return (
    <div>
      {design && <LibraryListingForm id={id} design={design} looks={looksQuery.data ?? []} />}

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Publish Checklist</h2>
        <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          <li className={validationPassed ? "" : "issue-error"}>
            {validationPassed ? "✓" : "✗"} Design has passed validation
          </li>
          <li className={hasBom ? "" : "issue-error"}>{hasBom ? "✓" : "✗"} Master BOM generated</li>
        </ul>
        {isDraft && (
          <button
            className="btn"
            disabled={!validationPassed || !hasBom || publishMutation.isPending}
            onClick={() => publishMutation.mutate()}
          >
            Publish to Design Library
          </button>
        )}
        {publishMutation.isError && <p className="issue-error">{(publishMutation.error as Error).message}</p>}
      </div>

      {isPublished && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Published</h2>
          <p style={{ marginBottom: 12 }}>
            This Template is published (v{design?.version}) and is now immutable. To make changes, revise it into a new
            draft version.
          </p>
          <button className="btn btn-secondary" disabled={reviseMutation.isPending} onClick={() => reviseMutation.mutate()}>
            Revise (create v{(design?.version ?? 1) + 1})
          </button>
        </div>
      )}
    </div>
  );
}
