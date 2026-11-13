import type {
  Account,
  Invoice,
  PublicStats,
  Subscription,
  SubscriptionInput,
  SubscriptionPage,
  SubscriptionStatus,
} from "./types";

const TOKEN_STORAGE_KEY = "billing-console-token";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable - the session simply will not persist */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach the server", 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export function apiRegister(username: string, password: string): Promise<Account> {
  return request<Account>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function apiLogin(username: string, password: string): Promise<{ token: string }> {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function apiLogout(): Promise<{ status: string }> {
  return request<{ status: string }>("/api/auth/logout", { method: "POST" });
}

export function apiMe(): Promise<Account> {
  return request<Account>("/api/auth/me");
}

export function apiPublicStats(): Promise<PublicStats> {
  return request<PublicStats>("/api/public/stats");
}

export type SubscriptionQuery = {
  q?: string;
  status?: SubscriptionStatus | "";
  plan?: string;
  page?: number;
  pageSize?: number;
};

export function apiSubscriptions(query: SubscriptionQuery = {}): Promise<SubscriptionPage> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.plan) params.set("plan", query.plan);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize) params.set("page_size", String(query.pageSize));
  const search = params.toString();
  return request<SubscriptionPage>(`/api/subscriptions${search ? `?${search}` : ""}`);
}

export function apiPlans(): Promise<{ items: string[] }> {
  return request<{ items: string[] }>("/api/subscriptions/plans");
}

export function apiSubscription(id: number): Promise<Subscription> {
  return request<Subscription>(`/api/subscriptions/${id}`);
}

export function apiCreateSubscription(input: SubscriptionInput): Promise<Subscription> {
  return request<Subscription>("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiUpdateSubscription(
  id: number,
  input: Partial<SubscriptionInput>,
): Promise<Subscription> {
  return request<Subscription>(`/api/subscriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function apiInvoices(id: number): Promise<{ items: Invoice[] }> {
  return request<{ items: Invoice[] }>(`/api/subscriptions/${id}/invoices`);
}

export function apiCreateInvoice(
  id: number,
  input: { amount_due?: number; due_date?: string },
): Promise<Invoice> {
  return request<Invoice>(`/api/subscriptions/${id}/invoices`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiRecordCollection(
  id: number,
  outcome: "failed" | "succeeded",
): Promise<Subscription & { outcome: string }> {
  return request<Subscription & { outcome: string }>(`/api/subscriptions/${id}/collections`, {
    method: "POST",
    body: JSON.stringify({ outcome }),
  });
}
