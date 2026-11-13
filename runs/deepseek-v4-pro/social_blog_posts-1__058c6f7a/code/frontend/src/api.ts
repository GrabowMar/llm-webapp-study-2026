export type Post = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author: string;
  excerpt: string;
};

export type PostList = {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
};

export type User = {
  username: string;
  is_admin: boolean;
};

const TOKEN_KEY = "blog_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

type ApiErrorBody = { error?: string };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg =
      data && typeof data === "object" && (data as ApiErrorBody).error
        ? (data as ApiErrorBody).error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg as string);
  }

  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/register", { username, password }),

  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),

  logout: () => request<{ status: string }>("POST", "/auth/logout"),

  me: () => request<User>("GET", "/auth/me"),

  listPosts: (params: {
    q?: string;
    tag?: string;
    author?: string;
    page?: number;
    page_size?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.tag) sp.set("tag", params.tag);
    if (params.author) sp.set("author", params.author);
    if (params.page) sp.set("page", String(params.page));
    if (params.page_size) sp.set("page_size", String(params.page_size));
    const qs = sp.toString();
    return request<PostList>("GET", `/posts${qs ? `?${qs}` : ""}`);
  },

  getPost: (id: number | string) => request<Post>("GET", `/posts/${id}`),

  createPost: (data: { title: string; content: string; tags: string[] }) =>
    request<Post>("POST", "/posts", data),

  updatePost: (
    id: number | string,
    data: { title: string; content: string; tags: string[] },
  ) => request<Post>("PUT", `/posts/${id}`, data),

  deletePost: (id: number | string) =>
    request<{ status: string }>("DELETE", `/posts/${id}`),

  togglePost: (id: number | string) =>
    request<Post>("POST", `/admin/posts/${id}/toggle`),
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
