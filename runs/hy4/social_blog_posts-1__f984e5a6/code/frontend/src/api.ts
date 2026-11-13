import { ApiError, type ApiErrorBody, type Post, type PostList, type Session } from "./types";

const TOKEN_KEY = "blog.token";
const NAME_KEY = "blog.username";
const ADMIN_KEY = "blog.isAdmin";

export function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(NAME_KEY);
  if (!token || !username) return null;
  return { token, username, isAdmin: localStorage.getItem(ADMIN_KEY) === "1" };
}

export function saveSession(session: Session): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(NAME_KEY, session.username);
  localStorage.setItem(ADMIN_KEY, session.isAdmin ? "1" : "0");
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(ADMIN_KEY);
}

let activeToken: string | null = loadSession()?.token ?? null;

export function setActiveToken(token: string | null): void {
  activeToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (activeToken) headers.set("Authorization", `Bearer ${activeToken}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, { message: "Could not reach the server. Please try again." });
  }
  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, (body as ApiErrorBody) || {});
  }
  return body as T;
}

function json(method: string, data?: unknown): RequestInit {
  return { method, body: data === undefined ? undefined : JSON.stringify(data) };
}

export interface PostQuery {
  q?: string;
  tag?: string;
  author?: string;
  page?: number;
  page_size?: number;
  include_hidden?: boolean;
}

export function listPosts(query: PostQuery = {}): Promise<PostList> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.tag) params.set("tag", query.tag);
  if (query.author) params.set("author", query.author);
  if (query.page) params.set("page", String(query.page));
  if (query.page_size) params.set("page_size", String(query.page_size));
  if (query.include_hidden) params.set("include_hidden", "1");
  const suffix = params.toString();
  return request<PostList>(`/posts${suffix ? `?${suffix}` : ""}`);
}

export function getPost(id: number): Promise<Post> {
  return request<Post>(`/posts/${id}`);
}

export function createPost(data: { title: string; content: string; tags: string[] }): Promise<Post> {
  return request<Post>("/posts", json("POST", data));
}

export function updatePost(
  id: number,
  data: { title: string; content: string; tags: string[] },
): Promise<Post> {
  return request<Post>(`/posts/${id}`, json("PUT", data));
}

export function deletePost(id: number): Promise<{ ok: boolean; id: number }> {
  return request<{ ok: boolean; id: number }>(`/posts/${id}`, { method: "DELETE" });
}

export function togglePost(id: number): Promise<Post> {
  return request<Post>(`/admin/posts/${id}/toggle`, json("POST", {}));
}

export async function register(username: string, password: string): Promise<Session> {
  const result = await request<{ token: string; username: string }>(
    "/auth/register",
    json("POST", { username, password }),
  );
  return { token: result.token, username: result.username, isAdmin: false };
}

export async function login(username: string, password: string): Promise<Session> {
  const result = await request<{ token: string }>(
    "/auth/login",
    json("POST", { username, password }),
  );
  return {
    token: result.token,
    username: username.trim(),
    isAdmin: username.trim().toLowerCase() === "admin",
  };
}
