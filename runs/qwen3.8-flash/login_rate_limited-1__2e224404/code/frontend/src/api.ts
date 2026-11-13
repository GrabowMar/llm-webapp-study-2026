export type ApiError = {
  status: number;
  error: string;
  message: string;
  retryAfter?: number;
};

export type Me = {
  id: number;
  username: string;
  last_login_at: string | null;
};

export type LoginAttempt = {
  at: string;
  success: boolean;
};

export type Lock = {
  username: string;
  locked_until: string;
};

const TOKEN_KEY = "auth-token";

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
  const token = getToken();
  if (token && options.auth !== false) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const retryAfter =
      Number(res.headers.get("Retry-After")) || data?.retry_after || undefined;
    const err: ApiError = {
      status: res.status,
      error: data?.error ?? "error",
      message: data?.message ?? `Request failed (${res.status})`,
      retryAfter,
    };
    throw err;
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  me: () => request<Me>("/api/me"),
  loginAttempts: () =>
    request<{ items: LoginAttempt[] }>("/api/me/login-attempts"),
  locks: () => request<{ items: Lock[] }>("/api/admin/locks"),
  unlock: (username: string) =>
    request<{ username: string; unlocked: boolean }>(
      `/api/admin/locks/${encodeURIComponent(username)}/unlock`,
      { method: "POST" },
    ),
};

export function isApiError(e: unknown): e is ApiError {
  return typeof e === "object" && e !== null && "status" in e;
}

export function formatInstant(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function retryMessage(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "Try again later.";
  if (seconds < 60) return `Try again in about ${seconds} second${seconds === 1 ? "" : "s"}.`;
  const mins = Math.ceil(seconds / 60);
  return `Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
}
