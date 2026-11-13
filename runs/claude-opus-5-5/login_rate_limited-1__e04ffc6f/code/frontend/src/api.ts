const TOKEN_KEY = "auth_token";

export type Me = {
  id: number;
  username: string;
  last_login_at: string | null;
  is_admin?: boolean;
};

export type LoginAttempt = { at: string; success: boolean; reason?: string };
export type Lock = { username: string; locked_until: string };

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfter?: number;

  constructor(status: number, message: string, code?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
    const obj = (data ?? {}) as { error?: string; code?: string; retry_after?: number };
    const header = Number(res.headers.get("Retry-After"));
    const retryAfter = Number.isFinite(header) && header > 0 ? header : obj.retry_after;
    throw new ApiError(res.status, obj.error ?? `Request failed (${res.status})`, obj.code, retryAfter);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<null>("POST", "/auth/logout"),
  me: () => request<Me>("GET", "/me"),
  attempts: () => request<{ items: LoginAttempt[] }>("GET", "/me/login-attempts"),
  locks: () => request<{ items: Lock[] }>("GET", "/admin/locks"),
  unlock: (username: string) =>
    request<{ username: string }>("POST", `/admin/locks/${encodeURIComponent(username)}/unlock`),
};

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m === 0) return `${rest}s`;
  return `${m}m ${rest.toString().padStart(2, "0")}s`;
}
