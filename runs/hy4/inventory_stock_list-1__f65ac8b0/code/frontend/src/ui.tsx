import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import type { ApiErrors } from "./api";

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: InputHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-300 disabled:bg-indigo-300",
    secondary:
      "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus:ring-slate-200",
    danger:
      "bg-red-600 text-white hover:bg-red-700 focus:ring-red-300 disabled:bg-red-300",
    ghost: "text-slate-600 hover:bg-slate-100 focus:ring-slate-200",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children?: ReactNode;
}) {
  return (
    <label className="block" htmlFor={name}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </div>
  );
}

export function FormErrors({
  errors,
  exclude = [],
}: {
  errors: ApiErrors;
  exclude?: string[];
}) {
  const messages = Object.entries(errors).filter(
    ([field]) => !exclude.includes(field),
  );
  if (messages.length === 0) return null;
  return (
    <div className="space-y-1 text-sm text-red-600">
      {messages.map(([field, message]) => (
        <div key={field}>{message}</div>
      ))}
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-slate-500">
      <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      Loading…
    </div>
  );
}

export function prevent(fn: () => void) {
  return (event: FormEvent) => {
    event.preventDefault();
    fn();
  };
}
