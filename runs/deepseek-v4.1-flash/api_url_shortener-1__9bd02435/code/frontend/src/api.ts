export type User = {
  id: number;
  username: string;
  is_admin: boolean;
};

export type Link = {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
  short_url: string;
  owner: string;
  disabled: boolean;
  active: boolean;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

const TOKEN_KEY = "shortener_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const body = data as { error?: string; message?: string } | null;
    const message =
      body?.error || body?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<User>("/api/auth/me"),
  logout: () => request<{ status: string }>("/api/auth/logout", { method: "POST" }),
  createLink: (original_url: string) =>
    request<Link>("/api/links", {
      method: "POST",
      body: JSON.stringify({ original_url }),
    }),
  listLinks: (page: number, pageSize: number) =>
    request<Page<Link>>(`/api/links?page=${page}&page_size=${pageSize}`),
  deleteLink: (id: number) =>
    request<void>(`/api/links/${id}`, { method: "DELETE" }),
  adminListLinks: (page: number, pageSize: number) =>
    request<Page<Link>>(
      `/api/admin/links?page=${page}&page_size=${pageSize}`,
    ),
  adminToggleLink: (id: number) =>
    request<Link>(`/api/admin/links/${id}/toggle`, { method: "POST" }),
};
