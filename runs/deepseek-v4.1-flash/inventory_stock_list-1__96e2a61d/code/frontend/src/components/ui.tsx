import type { ReactNode } from "react";

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
  }[kind];

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${styles}`} role="alert">
      {children}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export function Badge({
  tone,
  children,
}: {
  tone: "low" | "ok" | "neutral";
  children: ReactNode;
}) {
  const styles = {
    low: "bg-red-100 text-red-700 ring-red-200",
    ok: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles}`}
    >
      {children}
    </span>
  );
}
