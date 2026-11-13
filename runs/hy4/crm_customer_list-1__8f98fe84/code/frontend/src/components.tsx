import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { FieldErrors } from "./types";

const base =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm " +
  "placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

interface FieldProps {
  label: string;
  name: string;
  errors?: FieldErrors;
  children: React.ReactNode;
}

export function Field({ label, name, errors, children }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      {children}
      {errors?.[name] && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {errors[name]}
        </p>
      )}
    </div>
  );
}

export function TextInput(
  props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean },
) {
  const { invalid, className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`${base} ${invalid ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""} ${className}`}
    />
  );
}

export function TextArea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean },
) {
  const { invalid, className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`${base} ${invalid ? "border-red-400" : ""} ${className}`}
    />
  );
}

export function Select(
  props: InputHTMLAttributes<HTMLSelectElement> & { invalid?: boolean },
) {
  return (
    <select
      {...(props as InputHTMLAttributes<HTMLSelectElement>)}
      className={`${base} ${props.className || ""}`}
    />
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-300",
    secondary:
      "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-200",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-300",
    ghost: "text-slate-600 hover:bg-slate-100 focus:ring-slate-200",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12 text-slate-500">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </div>
  );
}
