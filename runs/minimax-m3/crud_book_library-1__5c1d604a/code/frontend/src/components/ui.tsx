import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-400";

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm font-medium text-rose-600">{message}</p>;
}

export function TextField({
  id,
  label,
  error,
  className,
  ...props
}: { id: string; label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <input id={id} name={id} className={inputClass} aria-invalid={error ? true : undefined} {...props} />
      <FieldError message={error} />
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  error,
  className,
  ...props
}: { id: string; label: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} name={id} className={inputClass} aria-invalid={error ? true : undefined} {...props} />
      <FieldError message={error} />
    </div>
  );
}

export function SelectField({
  id,
  label,
  error,
  className,
  children,
  ...props
}: { id: string; label: string; error?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={id} className={inputClass} aria-invalid={error ? true : undefined} {...props}>
        {children}
      </select>
      <FieldError message={error} />
    </div>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
  } as const;
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`} role="alert">
      {children}
    </div>
  );
}

export function RatingStars({
  value,
  className,
  showValue = true,
}: {
  value: number | null;
  className?: string;
  showValue?: boolean;
}) {
  if (value === null) {
    return <span className={className ?? "text-slate-400"}>Not rated</span>;
  }
  const rounded = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ""}`} title={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={index < rounded ? "text-amber-500" : "text-slate-200"}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
      {showValue ? (
        <span className="ml-1 text-sm font-semibold text-slate-700">{value.toFixed(1)}</span>
      ) : null}
    </span>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        {total === 0 ? "No books to show" : `Showing ${from}-${to} of ${total} books`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-slate-600">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
