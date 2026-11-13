export class ApiError extends Error {
  status: number;
  retryAfter: number | null;

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface User {
  id: number;
  username: string;
  last_login_at: string | null;
}

export interface LoginAttempt {
  at: string;
  success: boolean;
}

export interface Lock {
  username: string;
  locked_until: string;
}

const TOKEN_KEY = "auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // keep default message
    }
    const header = res.headers.get("Retry-After");
    const retryAfter = header ? parseInt(header, 10) : NaN;
    throw new ApiError(res.status, message, Number.isFinite(retryAfter) ? retryAfter : null);
  }
  return (await res.json()) as T;
}

export function register(username: string, password: string): Promise<User> {
  return request<User>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function fetchMe(): Promise<User> {
  return request<User>("/api/me");
}

export function fetchLoginAttempts(): Promise<{ items: LoginAttempt[] }> {
  return request<{ items: LoginAttempt[] }>("/api/me/login-attempts");
}

export function fetchLocks(): Promise<{ items: Lock[] }> {
  return request<{ items: Lock[] }>("/api/admin/locks");
}

export function unlock(username: string): Promise<{ username: string }> {
  return request<{ username: string }>(
    `/api/admin/locks/${encodeURIComponent(username)}/unlock`,
    { method: "POST" },
  );
}
