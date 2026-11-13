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
  comment: string | null;
  created_at: string;
  username: string;
}

export interface BookPage {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "booklib.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export function listBooks(q: string, page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (q.trim()) params.set("q", q.trim());
  return request<BookPage>(`/api/books?${params}`);
}

export function getBook(id: number) {
  return request<Book>(`/api/books/${id}`);
}

export function createBook(data: Record<string, unknown>) {
  return request<Book>("/api/books", { method: "POST", body: JSON.stringify(data) });
}

export function updateBook(id: number, data: Record<string, unknown>) {
  return request<Book>(`/api/books/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteBook(id: number) {
  return request<{ message: string }>(`/api/books/${id}`, { method: "DELETE" });
}

export function listReviews(bookId: number) {
  return request<{ items: Review[] }>(`/api/books/${bookId}/reviews`);
}

export function createReview(bookId: number, rating: number, comment: string) {
  return request<Review>(`/api/books/${bookId}/reviews`, {
    method: "POST",
    body: JSON.stringify({ rating, comment }),
  });
}

export function register(username: string, password: string) {
  return request<{ message: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}
