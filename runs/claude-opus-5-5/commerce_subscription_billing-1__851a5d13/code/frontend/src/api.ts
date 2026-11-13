export type Status = "trial" | "active" | "past_due" | "cancelled";

export const STATUSES: Status[] = ["trial", "active", "past_due", "cancelled"];

export const STATUS_LABELS: Record<Status, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
};

export interface Subscription {
  id: number;
  customer_name: string;
  plan: string;
  monthly_amount: number;
  renewal_date: string;
  status: Status;
  failed_payment_count: number;
  created_at: string;
}

export interface Invoice {
  id: number;
  subscription_id: number;
  amount_due: number;
  due_date: string;
  status: "open" | "paid";
  paid_at: string | null;
  created_at?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PublicStats {
  mrr: number;
  counts: Record<Status, number>;
  total: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "billing.token";
const USER_KEY = "billing.username";

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get username() {
    return localStorage.getItem(USER_KEY);
  },
  set(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = session.token;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const errField = data && typeof data === "object" ? (data as { error?: unknown }).error : undefined;
    const message = typeof errField === "string" && errField ? errField : `Request failed (${res.status})`;
    if (res.status === 401 && token && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(res.status, message);
  }
  return data as T;
}

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
export function formatMoney(n: number) {
  return money.format(n);
}

export function formatDateTime(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
