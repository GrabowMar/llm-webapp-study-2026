import type { ReactNode } from "react";
import { SEVERITIES, type Severity } from "./types";

const SEVERITY_STYLES: Record<string, string> = {
  sev1: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/40",
  sev2: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/40",
  sev3: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40",
  sev4: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/40",
};

const STATUS_STYLES: Record<string, string> = {
  investigating: "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/40",
  identified: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/40",
  monitoring: "bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/40",
  resolved: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40",
  open: "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/40",
  closed: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? "bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/40";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${style}`}
    >
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/40";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ${style}`}
    >
      {status}
    </span>
  );
}

export function BreachFlag({ breached }: { breached: boolean }) {
  if (!breached) {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/30">
        Within target
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300 ring-1 ring-red-400/50">
      Past target
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg shadow-black/20 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </h2>
  );
}

export function ErrorBanner({
  message,
  errors,
}: {
  message?: string | null;
  errors?: Record<string, string>;
}) {
  const entries = Object.entries(errors ?? {});
  if (!message && entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
      {message ? <p className="font-medium">{message}</p> : null}
      {entries.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {entries.map(([field, detail]) => (
            <li key={field}>
              <span className="font-semibold capitalize">{field}:</span> {detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && !error ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
      {error ? <span className="mt-1 block text-xs text-red-300">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20";

export const buttonPrimary =
  "inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50";

export const buttonGhost =
  "inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40";

export function severityOptions(): Severity[] {
  return SEVERITIES;
}
