import type { Account, OutboxMessage } from "./types";

export type ApiError = Error & { status: number };

const TOKEN_KEY = "account_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    const error = new Error(message) as ApiError;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export const api = {
  register: (username: string, password: string, email: string) =>
    request<Account>("/api/auth/register", {
      method: "POST",
      body: { username, password, email: email || null },
    }),

  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    }),

  logout: () =>
    request<{ status: string }>("/api/auth/logout", {
      method: "POST",
      auth: true,
    }),

  me: () => request<Account>("/api/me", { auth: true }),

  updateEmail: (email: string | null) =>
    request<Account>("/api/me", {
      method: "PATCH",
      auth: true,
      body: { email },
    }),

  changePassword: (current_password: string, new_password: string) =>
    request<{ status: string }>("/api/me/password", {
      method: "POST",
      auth: true,
      body: { current_password, new_password },
    }),

  requestReset: (identifier: string) =>
    request<{ message: string }>("/api/auth/password-reset", {
      method: "POST",
      body: { username: identifier },
    }),

  confirmReset: (token: string, new_password: string) =>
    request<{ status: string }>("/api/auth/password-reset/confirm", {
      method: "POST",
      body: { token, new_password },
    }),

  outbox: (to: string) =>
    request<{ items: OutboxMessage[] }>(
      `/api/outbox?to=${encodeURIComponent(to)}`,
    ),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}
