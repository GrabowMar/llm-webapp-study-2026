export type Status = "trial" | "active" | "past_due" | "cancelled";
export const STATUSES: Status[] = ["trial", "active", "past_due", "cancelled"];

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
}

export interface Page {
  items: Subscription[];
  total: number;
  page: number;
  page_size: number;
}

export interface Stats {
  mrr: number;
  counts: Record<Status, number>;
}

const TOKEN_KEY = "billing_token";
const USER_KEY = "billing_user";

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  user: () => localStorage.getItem(USER_KEY),
  set(token: string, user: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, user);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = session.token();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    if (res.status === 401 && token && !path.startsWith("/auth/")) onUnauthorized();
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export const statusLabel = (s: string) => s.replace("_", " ");
