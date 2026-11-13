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

export type BookInput = {
  title: string;
  author: string;
  year?: number;
  isbn?: string;
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "token";
const USER_KEY = "username";

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get username() {
    return localStorage.getItem(USER_KEY);
  },
  set(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = session.token;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/")) onUnauthorized();
    throw new ApiError(
      res.status,
      data?.error ?? `Request failed (${res.status})`,
      data?.errors ?? {},
    );
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  listBooks: (q: string, page: number, pageSize: number) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (q) params.set("q", q);
    return request<BookPage>("GET", `/books?${params}`);
  },
  getBook: (id: number) => request<Book>("GET", `/books/${id}`),
  createBook: (b: BookInput) => request<Book>("POST", "/books", b),
  updateBook: (id: number, b: BookInput) => request<Book>("PUT", `/books/${id}`, b),
  deleteBook: (id: number) => request<void>("DELETE", `/books/${id}`),
  listReviews: (id: number) => request<{ items: Review[] }>("GET", `/books/${id}/reviews`),
  addReview: (id: number, rating: number, comment: string) =>
    request<Review>("POST", `/books/${id}/reviews`, { rating, comment }),
};
