export type Status = "trial" | "active" | "past_due" | "cancelled";
export type CollectionOutcome = "failed" | "succeeded";

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

export interface Stats {
  mrr: number;
  counts: Record<string, number>;
}

export interface CollectionResult {
  id: number;
  subscription_id: number;
  outcome: CollectionOutcome;
  invoices_affected: number;
  created_at: string;
}

export interface AuthSnapshot {
  token: string | null;
  username: string | null;
}

const TOKEN_KEY = "billing.token";
const USERNAME_KEY = "billing.username";

function loadAuth(): AuthSnapshot {
  return {
    token: localStorage.getItem(TOKEN_KEY),
    username: localStorage.getItem(USERNAME_KEY),
  };
}

let authState: AuthSnapshot = loadAuth();
const authListeners = new Set<() => void>();

function commitAuth(next: AuthSnapshot): void {
  authState = next;
  if (next.token) {
    localStorage.setItem(TOKEN_KEY, next.token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  if (next.username) {
    localStorage.setItem(USERNAME_KEY, next.username);
  } else {
    localStorage.removeItem(USERNAME_KEY);
  }
  authListeners.forEach((listener) => listener());
}

export function subscribeAuth(listener: () => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function getAuth(): AuthSnapshot {
  return authState;
}

export function signIn(token: string, username: string): void {
  commitAuth({ token, username });
}

export function signOut(): void {
  commitAuth({ token: null, username: null });
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (authState.token) {
    headers["Authorization"] = `Bearer ${authState.token}`;
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

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
    if (
      response.status === 401 &&
      authState.token &&
      !path.startsWith("/api/auth/")
    ) {
      signOut();
    }
    const message =
      payload !== null &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export interface SubscriptionQuery {
  q?: string;
  status?: string;
  plan?: string;
  page?: number;
  page_size?: number;
}

export const api = {
  register(username: string, password: string): Promise<unknown> {
    return request("/api/auth/register", {
      method: "POST",
      body: { username, password },
    });
  },

  login(username: string, password: string): Promise<{ token: string }> {
    return request("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
  },

  listSubscriptions(query: SubscriptionQuery): Promise<SubscriptionPage> {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    if (query.plan) params.set("plan", query.plan);
    if (query.page !== undefined) params.set("page", String(query.page));
    if (query.page_size !== undefined) {
      params.set("page_size", String(query.page_size));
    }
    const suffix = params.toString();
    return request(`/api/subscriptions${suffix ? `?${suffix}` : ""}`);
  },

  getSubscription(id: number): Promise<Subscription> {
    return request(`/api/subscriptions/${id}`);
  },

  patchSubscription(
    id: number,
    fields: Partial<
      Pick<
        Subscription,
        | "customer_name"
        | "plan"
        | "monthly_amount"
        | "renewal_date"
        | "status"
      >
    >,
  ): Promise<Subscription> {
    return request(`/api/subscriptions/${id}`, {
      method: "PATCH",
      body: fields,
    });
  },

  listInvoices(id: number): Promise<{ items: Invoice[] }> {
    return request(`/api/subscriptions/${id}/invoices`);
  },

  issueInvoice(
    id: number,
    body: { amount_due?: number; due_date?: string },
  ): Promise<Invoice> {
    return request(`/api/subscriptions/${id}/invoices`, {
      method: "POST",
      body,
    });
  },

  recordCollection(
    id: number,
    outcome: CollectionOutcome,
  ): Promise<CollectionResult> {
    return request(`/api/subscriptions/${id}/collections`, {
      method: "POST",
      body: { outcome },
    });
  },

  publicStats(): Promise<Stats> {
    return request("/api/public/stats");
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong";
}
