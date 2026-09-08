"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastAction = { label: string; onClick: () => void };
export type ToastInput = { message: string; action?: ToastAction; durationMs?: number };
type Toast = ToastInput & { id: number };

type ToastContextValue = { showToast: (input: ToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { ...input, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, input.durationMs ?? DEFAULT_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-token-md bg-foreground text-background px-4 py-2.5 text-sm shadow-lg"
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                className="font-medium text-accent underline underline-offset-2 cursor-pointer"
                onClick={() => {
                  t.action?.onClick();
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
