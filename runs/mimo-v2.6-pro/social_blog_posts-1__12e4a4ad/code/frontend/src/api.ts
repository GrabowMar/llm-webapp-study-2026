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

export type PostListData = {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
};

export type Auth = {
  token: string;
  username: string;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "blog.token";
const USERNAME_KEY = "blog.username";

export function loadAuth(): Auth | null {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const username = window.localStorage.getItem(USERNAME_KEY);
    if (token && username) return { token, username };
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function saveAuth(auth: Auth): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, auth.token);
    window.localStorage.setItem(USERNAME_KEY, auth.username);
  } catch {
    /* storage unavailable */
  }
}

export function clearAuth(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, err);
  }
  return data as T;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
