import type { ReactNode } from "react";

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800"
    >
      {message}
    </div>
  );
}

export function Notice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
      {message}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export const primaryButtonClass =
  "rounded bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50";

export const secondaryButtonClass =
  "rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50";

export const dangerButtonClass =
  "rounded bg-red-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50";

export function Rating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-amber-500" aria-label={`Rating ${value} out of 5`}>
      <span aria-hidden="true">{"★".repeat(value) + "☆".repeat(5 - value)}</span>
      <span className="text-slate-600">{value}/5</span>
    </span>
  );
}
