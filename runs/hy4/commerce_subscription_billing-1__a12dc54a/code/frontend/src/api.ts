import type { SubscriptionInput } from "./types";

const TOKEN_KEY = "billing.token";
const USERNAME_KEY = "billing.username";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the server", 0);
  }

  let data: unknown = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export interface AuthResult {
  token: string;
  username?: string;
}

export const authApi = {
  register: (username: string, password: string) =>
    api<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
      auth: false,
    }).then((result) => ({ username: result.username })),
  login: (username: string, password: string) =>
    api<AuthResult>("/api/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  logout: () =>
    api<{ status: string }>("/api/auth/logout", { method: "POST" }).catch(
      () => ({ status: "ok" }),
    ),
};

export const statsApi = {
  get: () => api<import("./types").Stats>("/api/public/stats", { auth: false }),
};

export const subscriptionsApi = {
  list: (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    return api<import("./types").PagedSubscriptions>(
      `/api/subscriptions?${search.toString()}`,
    );
  },
  get: (id: number) => api<import("./types").Subscription>(`/api/subscriptions/${id}`),
  create: (input: SubscriptionInput) =>
    api<import("./types").Subscription>("/api/subscriptions", {
      method: "POST",
      body: input,
    }),
  update: (id: number, input: SubscriptionInput) =>
    api<import("./types").Subscription>(`/api/subscriptions/${id}`, {
      method: "PATCH",
      body: input,
    }),
  invoices: (id: number) =>
    api<{ items: import("./types").Invoice[] }>(
      `/api/subscriptions/${id}/invoices`,
    ),
  issueInvoice: (
    id: number,
    input: { amount_due?: number; due_date?: string },
  ) =>
    api<import("./types").Invoice>(`/api/subscriptions/${id}/invoices`, {
      method: "POST",
      body: input,
    }),
  collection: (id: number, outcome: "failed" | "succeeded") =>
    api<import("./types").Subscription>(
      `/api/subscriptions/${id}/collections`,
      { method: "POST", body: { outcome } },
    ),
};
