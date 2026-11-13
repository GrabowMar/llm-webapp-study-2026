export interface User {
  id: number;
  username: string;
  email: string | null;
}

export interface OutboxMessage {
  id: number;
  to: string;
  subject: string;
  body: string;
  sent_at: string;
}

const TOKEN_KEY = "***";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const register = (username: string, password: string, email: string) =>
  api<User>("/auth/register", { method: "POST", body: { username, password, email }, auth: false });

export const login = async (username: string, password: string) => {
  const { token } = await api<{ token: string }>("/auth/login", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
  setToken(token);
  return token;
};

export const fetchMe = () => api<User>("/me");

export const updateEmail = (email: string | null) =>
  api<User>("/me", { method: "PATCH", body: { email } });

export const changePassword = (current_password: string, new_password: string) =>
  api<{ ok: true }>("/me/password", { method: "POST", body: { current_password, new_password } });

export const requestPasswordReset = (identifier: string) => {
  const body = identifier.includes("@")
    ? { email: identifier }
    : { username: identifier };
  return api<{ message: string }>("/auth/password-reset", { method: "POST", body, auth: false });
};

export const confirmPasswordReset = (token: string, new_password: string) =>
  api<{ ok: true }>("/auth/password-reset/confirm", {
    method: "POST",
    body: { token, new_password },
    auth: false,
  });

export const fetchOutbox = (to: string) =>
  api<{ items: OutboxMessage[] }>(`/outbox?to=${encodeURIComponent(to)}`, { auth: false });
