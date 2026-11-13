export type Link = {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
  short_url: string;
  owner: string;
  is_active?: boolean;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type Me = { username: string; is_admin: boolean };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let token: string | null = localStorage.getItem("shortener_token");

export function getToken() {
  return token;
}

export function setToken(value: string | null) {
  token = value;
  if (value) localStorage.setItem("shortener_token", value);
  else localStorage.removeItem("shortener_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Cannot reach the server. Please try again.", 0);
  }
  let data: unknown = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export function shortUrl(link: Link) {
  return `${window.location.origin}${link.short_url}`;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string; is_admin: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ status: string }>("/auth/logout", { method: "POST" }),
  me: () => request<Me>("/me"),
  createLink: (original_url: string) =>
    request<Link>("/links", {
      method: "POST",
      body: JSON.stringify({ original_url }),
    }),
  links: (page: number, page_size: number) =>
    request<Page<Link>>(`/links?page=${page}&page_size=${page_size}`),
  deleteLink: (id: number) =>
    request<{ status: string }>(`/links/${id}`, { method: "DELETE" }),
  adminLinks: (page: number, page_size: number) =>
    request<Page<Link>>(`/admin/links?page=${page}&page_size=${page_size}`),
  toggleLink: (id: number) =>
    request<Link>(`/admin/links/${id}/toggle`, { method: "POST" }),
};
