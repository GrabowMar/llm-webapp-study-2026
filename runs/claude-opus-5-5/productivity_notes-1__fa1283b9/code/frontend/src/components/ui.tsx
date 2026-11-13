import type { ReactNode } from "react";
import { Link } from "../router";

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function TagChip({ tag, active, onClick }: { tag: string; active?: boolean; onClick?: () => void }) {
  const cls = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
    active ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
  }`;
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        #{tag}
      </button>
    );
  }
  return (
    <Link to={`/?tag=${encodeURIComponent(tag)}`} className={cls}>
      #{tag}
    </Link>
  );
}

export function PinBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
      title="Pinned"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
        <path d="M13.5 2.5a1 1 0 0 0-1.4 0L9.6 5 6 5.6a1 1 0 0 0-.5 1.7l2.6 2.6-4.4 4.4a.75.75 0 1 0 1.1 1.1l4.4-4.4 2.6 2.6a1 1 0 0 0 1.7-.5L14.1 10l2.5-2.5a1 1 0 0 0 0-1.4z" />
      </svg>
      Pinned
    </span>
  );
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  const cls =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-sky-200 bg-sky-50 text-sky-800";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-600">
      {message}
    </p>
  );
}

export const inputCls =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none";
export const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60";
export const btnSecondary =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
export const btnDanger =
  "inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60";
