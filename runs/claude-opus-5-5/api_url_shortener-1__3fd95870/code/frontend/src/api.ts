export interface Link {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
  short_url: string;
  owner: string;
  is_active: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface User {
  username: string;
  is_admin: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "shortener.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error, please try again");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`;
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/api/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string; is_admin: boolean }>("POST", "/api/auth/login", {
      username,
      password,
    }),
  logout: () => request<void>("POST", "/api/auth/logout"),
  me: () => request<User>("GET", "/api/auth/me"),
  createLink: (original_url: string) => request<Link>("POST", "/api/links", { original_url }),
  listLinks: (page: number, pageSize: number) =>
    request<Page<Link>>("GET", `/api/links?page=${page}&page_size=${pageSize}`),
  deleteLink: (id: number) => request<void>("DELETE", `/api/links/${id}`),
  adminLinks: (page: number, pageSize: number) =>
    request<Page<Link>>("GET", `/api/admin/links?page=${page}&page_size=${pageSize}`),
  toggleLink: (id: number) => request<Link>("POST", `/api/admin/links/${id}/toggle`),
};
