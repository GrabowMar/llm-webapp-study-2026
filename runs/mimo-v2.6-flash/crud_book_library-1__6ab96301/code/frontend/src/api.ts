export type Book = {
  id: number;
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
  created_at: string;
  review_count: number;
  average_rating: number | null;
};

export type Review = {
  id: number;
  book_id: number;
  rating: number;
  comment: string;
  created_at: string;
  username: string;
};

export type BookPage = {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
};

export type ApiErrorBody = {
  error?: string;
  errors?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function getUsername(): string | null {
  return localStorage.getItem("username");
}

export function setSession(token: string, username: string) {
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const body = (payload ?? {}) as ApiErrorBody;
    const message = body.error ?? `Request failed (${res.status})`;
    if (res.status === 401 && token) clearSession();
    throw new ApiError(res.status, message, body.errors ?? {});
  }

  return payload as T;
}
