export type SubscriptionStatus = "active" | "past_due" | "trial" | "cancelled";

export interface Subscription {
  id: number;
  customer_name: string;
  plan: string;
  monthly_amount: number;
  renewal_date: string;
  status: string;
  failed_payment_count: number;
  created_at: string;
}

export interface Invoice {
  id: number;
  subscription_id: number;
  amount_due: number;
  due_date: string;
  status: string;
  paid_at: string | null;
}

export interface Stats {
  mrr: number;
  counts: Record<string, number>;
}

export interface PagedSubscriptions {
  items: Subscription[];
  total: number;
  page: number;
  page_size: number;
}

export interface SubscriptionInput {
  customer_name?: string;
  plan?: string;
  monthly_amount?: number | string;
  renewal_date?: string;
  status?: string;
  failed_payment_count?: number | string;
}

export const STATUSES: SubscriptionStatus[] = [
  "active",
  "past_due",
  "trial",
  "cancelled",
];

export function statusLabel(status: string): string {
  switch (status) {
    case "past_due":
      return "Past due";
    case "trial":
      return "Trial";
    case "cancelled":
      return "Cancelled";
    case "active":
      return "Active";
    default:
      return status
        .replace(/_/g, " ")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function statusClasses(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "past_due":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "trial":
      return "bg-sky-100 text-sky-800 ring-sky-200";
    case "cancelled":
      return "bg-slate-200 text-slate-600 ring-slate-300";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export function formatMoney(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : "—";
}
