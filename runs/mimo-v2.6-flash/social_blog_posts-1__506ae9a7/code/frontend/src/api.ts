export type Post = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author: string;
  excerpt: string;
  taken_down?: boolean;
};

export type PostListResponse = {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "blog.token";
const USERNAME_KEY = "blog.username";

export function saveSession(username: string, token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function loadSession(): { username: string; token: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  if (!token || !username) return null;
  return { username, token };
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

type RequestOptions = {
  method?: string;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const session = loadSession();
  if (session) headers.Authorization = `Bearer ${session.token}`;

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const record = data as Record<string, unknown> | null;
    const message =
      (typeof record?.error === "string" && record.error) ||
      (typeof record?.message === "string" && record.message) ||
      `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export async function register(username: string, password: string): Promise<void> {
  await request("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
  return data.token;
}

export type PostFilters = {
  q?: string;
  tag?: string;
  author?: string;
  page?: number;
  page_size?: number;
  include_taken_down?: boolean;
};

export async function fetchPosts(filters: PostFilters): Promise<PostListResponse> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.author) params.set("author", filters.author);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.page_size) params.set("page_size", String(filters.page_size));
  if (filters.include_taken_down) params.set("include_taken_down", "1");
  const query = params.toString();
  return request<PostListResponse>(`/api/posts${query ? `?${query}` : ""}`);
}

export async function fetchPost(id: number): Promise<Post> {
  return request<Post>(`/api/posts/${id}`);
}

export type PostInput = {
  title: string;
  content: string;
  tags: string[];
};

export async function createPost(input: PostInput): Promise<Post> {
  return request<Post>("/api/posts", { method: "POST", body: input });
}

export async function updatePost(id: number, input: PostInput): Promise<Post> {
  return request<Post>(`/api/posts/${id}`, { method: "PUT", body: input });
}

export async function deletePost(id: number): Promise<void> {
  await request(`/api/posts/${id}`, { method: "DELETE" });
}

export async function togglePost(id: number): Promise<Post> {
  return request<Post>(`/api/admin/posts/${id}/toggle`, { method: "POST" });
}
