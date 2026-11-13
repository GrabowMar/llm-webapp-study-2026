export type LoginAttempt = { at: string; success: boolean };
export type Account = {
  id: number;
  username: string;
  last_login_at: string | null;
};
export type Lock = { username: string; locked_until: string };

export class ApiError extends Error {
  status: number;
  code: string | null;
  retryAfter: number | null;

  constructor(
    message: string,
    status: number,
    code: string | null,
    retryAfter: number | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

let authToken: string | null = localStorage.getItem("token");

export function getToken(): string | null {
  return authToken;
}

export function setToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}

async function request<T>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Could not reach the server.", 0, null, null);
  }

  const retryHeader = response.headers.get("Retry-After");
  const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : null;

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const data = (payload ?? {}) as { error?: string; code?: string };
    throw new ApiError(
      data.error || `Request failed (${response.status})`,
      response.status,
      data.code ?? null,
      Number.isFinite(retryAfter) ? retryAfter : null,
    );
  }

  return payload as T;
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string }>("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function logout() {
  setToken(null);
}

export function fetchMe() {
  return request<Account>("/api/me");
}

export function fetchAttempts() {
  return request<{ items: LoginAttempt[] }>("/api/me/login-attempts");
}

export function fetchLocks() {
  return request<{ items: Lock[] }>("/api/admin/locks");
}

export function unlockUser(username: string) {
  return request<{ status: string; username: string }>(
    `/api/admin/locks/${encodeURIComponent(username)}/unlock`,
    { method: "POST" },
  );
}

export function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes > 0) {
    return `${minutes}m ${rest.toString().padStart(2, "0")}s`;
  }
  return `${rest}s`;
}
