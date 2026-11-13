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

export interface PublicStats {
  mrr: number;
  counts: Record<string, number>;
}

export interface SubscriptionList {
  items: Subscription[];
  total: number;
  page: number;
  page_size: number;
}

const TOKEN_KEY = "billing_token";
const USERNAME_KEY = "billing_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  listSubscriptions: (params: {
    q?: string;
    status?: string;
    plan?: string;
    page?: number;
    page_size?: number;
  }) => request<SubscriptionList>(`/api/subscriptions${qs(params)}`),
  getSubscription: (id: number) =>
    request<Subscription>(`/api/subscriptions/${id}`),
  createSubscription: (body: Partial<Subscription>) =>
    request<Subscription>("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchSubscription: (id: number, body: Partial<Subscription>) =>
    request<Subscription>(`/api/subscriptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listInvoices: (id: number) =>
    request<{ items: Invoice[] }>(`/api/subscriptions/${id}/invoices`),
  issueInvoice: (id: number, body: { amount_due?: number; due_date?: string }) =>
    request<Invoice>(`/api/subscriptions/${id}/invoices`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  recordCollection: (id: number, outcome: "failed" | "succeeded") =>
    request<Subscription>(`/api/subscriptions/${id}/collections`, {
      method: "POST",
      body: JSON.stringify({ outcome }),
    }),
  publicStats: () => request<PublicStats>("/api/public/stats"),
};

export const STATUS_OPTIONS = [
  "active",
  "past_due",
  "trial",
  "cancelled",
] as const;

export function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}
