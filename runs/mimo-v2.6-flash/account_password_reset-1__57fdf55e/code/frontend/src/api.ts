export interface Account {
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

const TOKEN_KEY = "auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export interface ApiResult<T> {
  status: number;
  data: T | null;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

export function apiError(result: ApiResult<unknown>, fallback: string): string {
  const data = result.data as { error?: unknown } | null;
  if (data && typeof data.error === "string" && data.error) {
    return data.error;
  }
  return fallback;
}
