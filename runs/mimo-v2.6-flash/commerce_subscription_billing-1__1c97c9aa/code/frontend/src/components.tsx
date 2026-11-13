import type { Status } from "./api";

const STATUS_LABELS: Record<string, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  "past-due": "Past due",
  cancelled: "Cancelled",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  trial: "bg-sky-50 text-sky-700 ring-sky-600/20",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  past_due: "bg-amber-50 text-amber-700 ring-amber-600/20",
  "past-due": "bg-amber-50 text-amber-700 ring-amber-600/20",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

const INVOICE_BADGE_CLASSES: Record<string, string> = {
  open: "bg-amber-50 text-amber-700 ring-amber-600/20",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export const STATUS_ORDER: Status[] = [
  "active",
  "past_due",
  "trial",
  "cancelled",
];

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function canonicalStatus(status: string): Status {
  return (status === "past-due" ? "past_due" : status) as Status;
}

export function statusCount(
  counts: Record<string, number>,
  status: Status
): number {
  return (
    counts[status] ??
    (status === "past_due" ? counts["past-due"] ?? 0 : 0)
  );
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: string): string {
  return value.slice(0, 10);
}

export function StatusBadge({ status }: { status: string }) {
  const classes =
    STATUS_BADGE_CLASSES[status] ?? "bg-slate-100 text-slate-700 ring-slate-600/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function InvoiceBadge({ status }: { status: string }) {
  const classes =
    INVOICE_BADGE_CLASSES[status] ??
    "bg-slate-100 text-slate-700 ring-slate-600/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}
    >
      {status}
    </span>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function SuccessNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {message}
    </div>
  );
}

export function LoadingNote({ label = "Loading…" }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-slate-500">{label}</p>;
}
