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

export type BookPage = { items: Book[]; total: number; page: number; page_size: number };

export type BookInput = { title: string; author: string; year?: number | string | null; isbn?: string | null };

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;
  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "library.token";
const USER_KEY = "library.username";

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  username: () => localStorage.getItem(USER_KEY),
  set(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = session.token();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`, data?.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  listBooks: (q: string, page: number, pageSize: number) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (q) params.set("q", q);
    return request<BookPage>("GET", `/books?${params}`);
  },
  getBook: (id: number) => request<Book>("GET", `/books/${id}`),
  createBook: (input: BookInput) => request<Book>("POST", "/books", input),
  updateBook: (id: number, input: BookInput) => request<Book>("PUT", `/books/${id}`, input),
  deleteBook: (id: number) => request<void>("DELETE", `/books/${id}`),
  listReviews: (id: number) => request<{ items: Review[] }>("GET", `/books/${id}/reviews`),
  addReview: (id: number, rating: number, comment: string) =>
    request<Review>("POST", `/books/${id}/reviews`, { rating, comment }),
};
