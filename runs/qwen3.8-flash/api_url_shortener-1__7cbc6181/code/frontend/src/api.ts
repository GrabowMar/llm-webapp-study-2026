import type { Link, Page } from "./types";

const TOKEN_KEY = "urlshortener.token";

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no json */
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  createLink: (original_url: string) =>
    request<Link>("/api/links", {
      method: "POST",
      body: JSON.stringify({ original_url }),
    }),
  listLinks: (page: number, pageSize: number) =>
    request<Page<Link>>(`/api/links?page=${page}&page_size=${pageSize}`),
  deleteLink: (id: number) => request<Link>(`/api/links/${id}`, { method: "DELETE" }),
  adminListLinks: (page: number, pageSize: number) =>
    request<Page<Link>>(`/api/admin/links?page=${page}&page_size=${pageSize}`),
  adminToggleLink: (id: number) =>
    request<Link>(`/api/admin/links/${id}/toggle`, { method: "POST" }),
};
