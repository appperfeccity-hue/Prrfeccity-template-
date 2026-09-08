"use client";

import { use } from "react";
import { UndoRedoProvider } from "@/lib/undo-redo";
import { CanvasStoreProvider } from "@/lib/canvas/store";
import { CommandHeader } from "@/components/layout/CommandHeader";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { StatusRail } from "@/components/layout/StatusRail";

export default function DesignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <UndoRedoProvider key={id}>
      <CanvasStoreProvider>
        <div>
          <CommandHeader designId={id} />
          <StatusRail designId={id} />
          <WorkspaceTabs designId={id} />
          {children}
        </div>
      </CanvasStoreProvider>
    </UndoRedoProvider>
  );
}
