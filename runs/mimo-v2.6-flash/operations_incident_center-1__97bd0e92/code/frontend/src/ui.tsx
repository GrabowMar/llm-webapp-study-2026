import type { ReactNode } from "react";
import type { Severity, Status } from "./api";

export const SEVERITIES: Severity[] = ["sev1", "sev2", "sev3", "sev4"];
export const STATUSES: Status[] = [
  "investigating",
  "identified",
  "mitigating",
  "monitoring",
  "resolved",
];

const SEVERITY_STYLES: Record<Severity, string> = {
  sev1: "bg-red-100 text-red-700 ring-red-200",
  sev2: "bg-orange-100 text-orange-700 ring-orange-200",
  sev3: "bg-amber-100 text-amber-800 ring-amber-200",
  sev4: "bg-sky-100 text-sky-700 ring-sky-200",
};

const STATUS_STYLES: Record<Status, string> = {
  investigating: "bg-amber-100 text-amber-800 ring-amber-200",
  identified: "bg-blue-100 text-blue-700 ring-blue-200",
  mitigating: "bg-purple-100 text-purple-700 ring-purple-200",
  monitoring: "bg-teal-100 text-teal-700 ring-teal-200",
  resolved: "bg-green-100 text-green-700 ring-green-200",
};

export function severityLabel(severity: Severity): string {
  return severity.toUpperCase();
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY_STYLES[severity]}`}
    >
      {severityLabel(severity)}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function BreachBadge({ breached }: { breached: boolean }) {
  if (!breached) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
        Within target
      </span>
    );
  }
  return (
    <span className="inline-flex animate-pulse items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
      SLA breached
    </span>
  );
}

export function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, error, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

export const buttonPrimaryClass =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const buttonSecondaryClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
