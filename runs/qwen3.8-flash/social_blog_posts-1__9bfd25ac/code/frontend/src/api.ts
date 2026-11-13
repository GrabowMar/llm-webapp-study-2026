import type { ListParams, Post, PostInput, PostList, User } from "./types";

const TOKEN_KEY = "blog_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
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
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* ignore non-JSON bodies */
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ message: string; username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<User>("/auth/me"),
  listPosts: (params: ListParams) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "" && value !== null) {
        query.set(key, String(value));
      }
    }
    const suffix = query.toString();
    return request<PostList>(`/posts${suffix ? `?${suffix}` : ""}`);
  },
  getPost: (id: number) => request<Post>(`/posts/${id}`),
  createPost: (input: PostInput) =>
    request<Post>("/posts", { method: "POST", body: JSON.stringify(input) }),
  updatePost: (id: number, input: PostInput) =>
    request<Post>(`/posts/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deletePost: (id: number) => request<void>(`/posts/${id}`, { method: "DELETE" }),
  togglePost: (id: number) =>
    request<Post>(`/admin/posts/${id}/toggle`, { method: "POST" }),
};
