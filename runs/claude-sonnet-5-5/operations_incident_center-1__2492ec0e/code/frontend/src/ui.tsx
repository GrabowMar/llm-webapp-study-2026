import type { ReactNode } from "react";
import type { Severity, Status } from "./api";

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
export const btnCls =
  "inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSecondaryCls =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const SEV_COLORS: Record<Severity, string> = {
  sev1: "bg-red-100 text-red-800 ring-red-600/20",
  sev2: "bg-orange-100 text-orange-800 ring-orange-600/20",
  sev3: "bg-amber-100 text-amber-800 ring-amber-600/20",
  sev4: "bg-sky-100 text-sky-800 ring-sky-600/20",
};

const STATUS_COLORS: Record<Status, string> = {
  investigating: "bg-rose-50 text-rose-700 ring-rose-600/20",
  identified: "bg-violet-50 text-violet-700 ring-violet-600/20",
  monitoring: "bg-blue-50 text-blue-700 ring-blue-600/20",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const badge = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`${badge} ${SEV_COLORS[severity]}`}>{severity.toUpperCase()}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`${badge} ${STATUS_COLORS[status]}`}>{status}</span>;
}

export function BreachedFlag() {
  return (
    <span className={`${badge} bg-red-600 text-white ring-red-700`} title="Past resolution target">
      SLA breached
    </span>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="block text-sm text-red-600">{error}</span>}
    </label>
  );
}

export function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
