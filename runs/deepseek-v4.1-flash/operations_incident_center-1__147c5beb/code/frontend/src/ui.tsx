import { useEffect, useState } from "react";

export const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;
export const STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;

export function severityBadge(severity: string): string {
  switch (severity) {
    case "sev1":
      return "bg-red-100 text-red-800 ring-red-600/20";
    case "sev2":
      return "bg-orange-100 text-orange-800 ring-orange-600/20";
    case "sev3":
      return "bg-yellow-100 text-yellow-800 ring-yellow-600/20";
    default:
      return "bg-sky-100 text-sky-800 ring-sky-600/20";
  }
}

export function statusBadge(status: string): string {
  switch (status) {
    case "resolved":
      return "bg-emerald-100 text-emerald-800 ring-emerald-600/20";
    case "monitoring":
      return "bg-blue-100 text-blue-800 ring-blue-600/20";
    case "identified":
      return "bg-purple-100 text-purple-800 ring-purple-600/20";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-600/20";
  }
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function humanStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(handle);
  }, [intervalMs]);
  return now;
}

export interface NoticeProps {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
}

export function Notice({ tone, children }: NoticeProps) {
  const tones = {
    error: "bg-red-50 text-red-800 ring-red-600/20",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
    info: "bg-sky-50 text-sky-800 ring-sky-600/20",
  } as const;
  return (
    <div className={`rounded-md px-3 py-2 text-sm ring-1 ${tones[tone]}`}>
      {children}
    </div>
  );
}
