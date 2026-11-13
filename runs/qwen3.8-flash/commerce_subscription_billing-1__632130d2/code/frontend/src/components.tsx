import type { ReactNode } from "react";
import type { Status, Subscription, Invoice } from "./api";
import { fmtDateTime, fmtMoney, STATUS_BADGE, STATUS_LABEL } from "./api";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_BADGE[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function SubscriptionRow({
  sub,
  onOpen,
}: {
  sub: Subscription;
  onOpen: (id: number) => void;
}) {
  return (
    <tr
      className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
      onClick={() => onOpen(sub.id)}
    >
      <td className="px-4 py-3 text-sm font-medium text-slate-900">
        {sub.customer_name}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{sub.plan}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-900">
        {fmtMoney(sub.monthly_amount)}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{sub.renewal_date}</td>
      <td className="px-4 py-3">
        <StatusBadge status={sub.status} />
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600">
        {sub.failed_payment_count > 0 ? (
          <span className="font-semibold text-amber-700">
            {sub.failed_payment_count}
          </span>
        ) : (
          "0"
        )}
      </td>
    </tr>
  );
}

export function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500">
        #{invoice.id}
      </td>
      <td className="px-4 py-2.5 text-sm font-medium tabular-nums text-slate-900">
        {fmtMoney(invoice.amount_due)}
      </td>
      <td className="px-4 py-2.5 text-sm text-slate-600">{invoice.due_date}</td>
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
            invoice.status === "paid"
              ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
              : "bg-slate-100 text-slate-700 ring-slate-200"
          }`}
        >
          {invoice.status === "paid" ? "Paid" : invoice.status === "open" ? "Open" : invoice.status}
        </span>
      </td>
      <td className="px-4 py-2.5 text-sm text-slate-500">
        {fmtDateTime(invoice.paid_at)}
      </td>
    </tr>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      {label ?? "Loading…"}
    </div>
  );
}
