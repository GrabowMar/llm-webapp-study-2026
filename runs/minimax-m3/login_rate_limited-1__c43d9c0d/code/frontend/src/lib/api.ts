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

type ErrorPayload = {
  error?: string;
  message?: string;
  retry_after?: number;
  locked_until?: string | null;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | null;
  readonly lockedUntil: string | null;

  constructor(status: number, payload: ErrorPayload, retryAfterHeader: string | null) {
    super(payload.message ?? payload.error ?? "Request failed.");
    this.name = "ApiError";
    this.status = status;
    this.code = payload.error ?? "error";
    this.retryAfter =
      typeof payload.retry_after === "number"
        ? payload.retry_after
        : retryAfterHeader
          ? Number(retryAfterHeader)
          : null;
    this.lockedUntil = payload.locked_until ?? null;
  }

  get isLocked() {
    return this.code === "locked";
  }

  get isRateLimited() {
    return this.code === "rate_limited";
  }

  get isTooMany() {
    return this.status === 429;
  }
}

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as ErrorPayload;
    throw new ApiError(response.status, body, response.headers.get("Retry-After"));
  }

  return (payload ?? null) as T;
}

export function login(username: string, password: string) {
  return apiRequest<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function register(username: string, password: string) {
  return apiRequest<{ id: number; username: string }>("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export function fetchMe(token: string) {
  return apiRequest<Me>("/api/me", { token });
}

export function fetchLoginAttempts(token: string) {
  return apiRequest<{ items: LoginAttempt[] }>("/api/me/login-attempts", { token });
}

export function fetchLocks(token: string) {
  return apiRequest<{ items: Lock[] }>("/api/admin/locks", { token });
}

export function unlockUser(token: string, username: string) {
  return apiRequest<{ username: string; unlocked: boolean }>(
    `/api/admin/locks/${encodeURIComponent(username)}/unlock`,
    { method: "POST", token },
  );
}
