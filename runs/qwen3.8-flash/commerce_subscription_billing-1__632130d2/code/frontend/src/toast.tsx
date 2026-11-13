import { useEffect, useState } from "react";

export interface Toast {
  id: number;
  kind: "success" | "error";
  message: string;
}

let nextId = 1;
const listeners = new Set<(toast: Toast) => void>();

export function pushToast(kind: Toast["kind"], message: string): void {
  const toast = { id: nextId++, kind, message };
  for (const listener of listeners) listener(toast);
}

export const toast = {
  success: (message: string) => pushToast("success", message),
  error: (message: string) => pushToast("error", message),
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const add = (item: Toast) => {
      setToasts((prev) => [...prev, item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 4000);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ring-1 ${
            t.kind === "success"
              ? "bg-emerald-600 text-white ring-emerald-500"
              : "bg-rose-600 text-white ring-rose-500"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
