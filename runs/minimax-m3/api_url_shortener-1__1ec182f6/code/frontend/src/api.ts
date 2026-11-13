import type { Link, LoginResponse, Page, User } from "./types";
const TOKEN_KEY = "shortener.token";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const data = payload as { message?: string; error?: string } | null;
    const message =
      data?.message ?? data?.error ?? `The request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const api = {
  register(username: string, password: string): Promise<User> {
    return request<User>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  login(username: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  me(): Promise<User> {
    return request<User>("/api/me");
  },
  createLink(url: string): Promise<Link> {
    return request<Link>("/api/links", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },
  listLinks(page: number, pageSize: number): Promise<Page<Link>> {
    return request<Page<Link>>(`/api/links?page=${page}&page_size=${pageSize}`);
  },
  deleteLink(id: number): Promise<void> {
    return request<void>(`/api/links/${id}`, { method: "DELETE" });
  },
  adminListLinks(page: number, pageSize: number): Promise<Page<Link>> {
    return request<Page<Link>>(`/api/admin/links?page=${page}&page_size=${pageSize}`);
  },
  toggleLink(id: number): Promise<Link> {
    return request<Link>(`/api/admin/links/${id}/toggle`, { method: "POST" });
  },
};

export function absoluteShortUrl(link: Link): string {
  if (/^https?:\/\//i.test(link.short_url)) {
    return link.short_url;
  }
  return `${window.location.origin}${link.short_url}`;
}

export function isOwnedBy(link: Link, user: User): boolean {
  if (typeof link.owner_id === "number") {
    return link.owner_id === user.id;
  }
  return link.owner === user.username;
}

export function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return fallback;
}
