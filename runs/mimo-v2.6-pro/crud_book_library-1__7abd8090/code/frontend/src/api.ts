import type { Book, BookPage, Review, ReviewList } from "./types";

const TOKEN_KEY = "book_library_token";
const USERNAME_KEY = "book_library_username";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function storeAuth(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(path, { ...options, headers });
  let data: unknown = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const body = data as { message?: string; error?: string } | null;
    const message =
      body?.message || body?.error || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export async function register(username: string, password: string): Promise<void> {
  await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data.token;
}

export async function listBooks(params: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<BookPage> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.pageSize !== undefined) query.set("page_size", String(params.pageSize));
  const qs = query.toString();
  return request<BookPage>(`/api/books${qs ? `?${qs}` : ""}`);
}

export async function getBook(id: number): Promise<Book> {
  return request<Book>(`/api/books/${id}`);
}

export async function createBook(
  book: { title: string; author: string; year?: number | string; isbn?: string },
): Promise<Book> {
  return request<Book>("/api/books", {
    method: "POST",
    body: JSON.stringify(book),
  });
}

export async function updateBook(
  id: number,
  book: { title: string; author: string; year?: number | string; isbn?: string },
): Promise<Book> {
  return request<Book>(`/api/books/${id}`, {
    method: "PUT",
    body: JSON.stringify(book),
  });
}

export async function deleteBook(id: number): Promise<void> {
  await request(`/api/books/${id}`, { method: "DELETE" });
}

export async function listReviews(bookId: number): Promise<ReviewList> {
  return request<ReviewList>(`/api/books/${bookId}/reviews`);
}

export async function createReview(
  bookId: number,
  review: { rating: number; comment?: string },
): Promise<Review> {
  return request<Review>(`/api/books/${bookId}/reviews`, {
    method: "POST",
    body: JSON.stringify(review),
  });
}
