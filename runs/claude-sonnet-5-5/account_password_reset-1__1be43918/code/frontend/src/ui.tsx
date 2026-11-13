import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
export const btnCls =
  "rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-3 block text-sm font-medium text-slate-700">
      {label}
      <input className={`${inputCls} mt-1 font-normal`} {...props} />
    </label>
  );
}

export function Notice({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error)
    return (
      <p role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  if (ok)
    return (
      <p role="status" className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700">
        {ok}
      </p>
    );
  return null;
}
