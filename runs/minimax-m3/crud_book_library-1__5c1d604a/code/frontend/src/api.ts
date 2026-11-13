export interface Book {
  id: number;
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
  created_at: string;
  review_count: number;
  average_rating: number | null;
}

export interface Review {
  id: number;
  book_id: number;
  rating: number;
  comment: string;
  created_at: string;
  username: string;
}

export interface BookListResponse {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReviewListResponse {
  items: Review[];
}

export interface User {
  id: number;
  username: string;
}

export interface BookInput {
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
}

export interface ReviewInput {
  rating: number;
  comment: string;
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

const TOKEN_KEY = "booklib.token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable */
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
  if (options.auth !== false) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const data = (payload ?? {}) as { error?: string; errors?: Record<string, string> };
    const message = data.error ?? `Request failed with status ${response.status}.`;
    throw new ApiError(response.status, message, data.errors ?? {});
  }

  return payload as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string; token: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
      auth: false,
    });
  },
  login(username: string, password: string) {
    return request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    });
  },
  me() {
    return request<User>("/api/auth/me");
  },
  listBooks(params: { q?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.page && params.page > 0) query.set("page", String(params.page));
    if (params.pageSize && params.pageSize > 0) query.set("page_size", String(params.pageSize));
    const suffix = query.toString();
    return request<BookListResponse>(`/api/books${suffix ? `?${suffix}` : ""}`);
  },
  getBook(id: number) {
    return request<Book>(`/api/books/${id}`);
  },
  createBook(input: BookInput) {
    return request<Book>("/api/books", { method: "POST", body: input });
  },
  updateBook(id: number, input: BookInput) {
    return request<Book>(`/api/books/${id}`, { method: "PUT", body: input });
  },
  deleteBook(id: number) {
    return request<void>(`/api/books/${id}`, { method: "DELETE" });
  },
  listReviews(bookId: number) {
    return request<ReviewListResponse>(`/api/books/${bookId}/reviews`);
  },
  createReview(bookId: number, input: ReviewInput) {
    return request<Review>(`/api/books/${bookId}/reviews`, { method: "POST", body: input });
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
