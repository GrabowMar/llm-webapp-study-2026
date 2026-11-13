export interface Post {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author: string;
  excerpt: string;
  taken_down?: boolean;
}

export interface PostPage {
  items: Post[];
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
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "blog_token";

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
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error. Please try again.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, d.error || `Request failed (${res.status})`, d.errors || {});
  }
  return data as T;
}

export interface ListParams {
  q?: string;
  tag?: string;
  author?: string;
  page?: number;
  page_size?: number;
  include_taken_down?: boolean;
}

export const api = {
  register: (username: string, password: string) =>
    request<User>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string; is_admin: boolean }>("POST", "/auth/login", {
      username,
      password,
    }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<User>("GET", "/auth/me"),
  listPosts: (params: ListParams) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.tag) sp.set("tag", params.tag);
    if (params.author) sp.set("author", params.author);
    if (params.page) sp.set("page", String(params.page));
    if (params.page_size) sp.set("page_size", String(params.page_size));
    if (params.include_taken_down) sp.set("include_taken_down", "1");
    const qs = sp.toString();
    return request<PostPage>("GET", `/posts${qs ? `?${qs}` : ""}`);
  },
  getPost: (id: number) => request<Post>("GET", `/posts/${id}`),
  createPost: (data: { title: string; content: string; tags: string[] }) =>
    request<Post>("POST", "/posts", data),
  updatePost: (id: number, data: { title: string; content: string; tags: string[] }) =>
    request<Post>("PUT", `/posts/${id}`, data),
  deletePost: (id: number) => request<void>("DELETE", `/posts/${id}`),
  togglePost: (id: number) => request<Post>("POST", `/admin/posts/${id}/toggle`),
};
