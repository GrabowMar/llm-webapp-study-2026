export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter: number | null;
  retryAt: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfter: number | null,
    retryAt: string | null,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.retryAt = retryAt;
  }
}

const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    let retryAfter: number | null = null;
    const header = Number(res.headers.get("Retry-After"));
    if (Number.isFinite(header) && header > 0) retryAfter = header;
    else if (typeof data?.retry_after === "number") retryAfter = data.retry_after;
    const retryAt =
      typeof data?.retry_at === "string"
        ? data.retry_at
        : retryAfter !== null
          ? new Date(Date.now() + retryAfter * 1000).toISOString()
          : null;
    throw new ApiError(
      res.status,
      data?.error ?? "error",
      data?.message ?? `Request failed (${res.status})`,
      retryAfter,
      retryAt,
    );
  }
  return data as T;
}

export type Me = {
  id: number;
  username: string;
  last_login_at: string | null;
  is_admin: boolean;
};
export type Attempt = { at: string; success: boolean };
export type Lock = { username: string; locked_until: string };
