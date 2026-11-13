import type { Post, PostInput, PostPage, RegisterResponse, User } from "./types";

const TOKEN_KEY = "inkwell.token";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null): void {
  try {
    if (token === null) {
      window.localStorage.removeItem(TOKEN_KEY);
    } else {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    /* storage unavailable: the session simply does not survive a reload */
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = readToken();
  if (token && options.auth !== false) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "The request could not be completed.";
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export interface ListParams {
  q?: string;
  tag?: string;
  author?: string;
  page?: number;
  page_size?: number;
}

function query(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.tag) search.set("tag", params.tag);
  if (params.author) search.set("author", params.author);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export const api = {
  register: (username: string, password: string) =>
    request<RegisterResponse>("/api/auth/register", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),

  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  me: () => request<User>("/api/auth/me"),

  listPosts: (params: ListParams) => request<PostPage>(`/api/posts${query(params)}`),

  getPost: (id: number) => request<Post>(`/api/posts/${id}`),

  createPost: (input: PostInput) =>
    request<Post>("/api/posts", { method: "POST", body: input }),

  updatePost: (id: number, input: PostInput) =>
    request<Post>(`/api/posts/${id}`, { method: "PUT", body: input }),

  deletePost: (id: number) => request<null>(`/api/posts/${id}`, { method: "DELETE" }),

  togglePost: (id: number) =>
    request<{ ok: boolean; hidden: boolean; post: Post }>(`/api/admin/posts/${id}/toggle`, {
      method: "POST",
    }),

  hiddenPosts: () => request<PostPage>("/api/admin/posts"),

  tags: () => request<{ items: string[]; total: number }>("/api/tags"),

  authors: () => request<{ items: string[]; total: number }>("/api/authors"),
};
