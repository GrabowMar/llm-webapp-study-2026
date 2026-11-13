export type Status = "trial" | "active" | "past_due" | "cancelled";

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
  status: string;
  paid_at: string | null;
}

export interface SubscriptionPage {
  items: Subscription[];
  total: number;
  page: number;
  page_size: number;
}

export interface PublicStats {
  mrr: number;
  counts: Record<Status, number>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "billing.token";
const USER_KEY = "billing.username";

export function getSession(): { token: string; username: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  return token && username ? { token, username } : null;
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const session = getSession();
  if (auth && session) headers["Authorization"] = `Bearer ${session.token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearSession();
      window.dispatchEvent(new Event("billing-unauthorized"));
    }
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export interface ListParams {
  q?: string;
  status?: string;
  plan?: string;
  page?: number;
  page_size?: number;
}

function qs(params: ListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== null) {
      search.set(key, String(value));
    }
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/auth/register", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  publicStats: () => request<PublicStats>("/public/stats", { auth: false }),
  listSubscriptions: (params: ListParams) =>
    request<SubscriptionPage>(`/subscriptions${qs(params)}`),
  getSubscription: (id: number) => request<Subscription>(`/subscriptions/${id}`),
  createSubscription: (body: Record<string, unknown>) =>
    request<Subscription>("/subscriptions", { method: "POST", body }),
  patchSubscription: (id: number, body: Record<string, unknown>) =>
    request<Subscription>(`/subscriptions/${id}`, { method: "PATCH", body }),
  listInvoices: (id: number) =>
    request<{ items: Invoice[] }>(`/subscriptions/${id}/invoices`),
  createInvoice: (id: number, body: Record<string, unknown>) =>
    request<Invoice>(`/subscriptions/${id}/invoices`, { method: "POST", body }),
  recordCollection: (id: number, outcome: "failed" | "succeeded") =>
    request<{
      outcome: string;
      processed_invoices: number;
      open_invoices: number;
      subscription: Subscription;
    }>(`/subscriptions/${id}/collections`, { method: "POST", body: { outcome } }),
};

export const STATUSES: Status[] = ["trial", "active", "past_due", "cancelled"];

export const STATUS_LABEL: Record<Status, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
};

export const STATUS_BADGE: Record<Status, string> = {
  trial: "bg-sky-100 text-sky-800 ring-sky-200",
  active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  past_due: "bg-amber-100 text-amber-800 ring-amber-200",
  cancelled: "bg-rose-100 text-rose-800 ring-rose-200",
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function fmtMoney(value: number): string {
  return currency.format(value);
}

export function fmtDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
