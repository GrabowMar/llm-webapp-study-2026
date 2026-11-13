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

export type PagedBooks = {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
};

export type BookInput = {
  title: string;
  author: string;
  year: string;
  isbn: string;
};

const TOKEN_KEY = "library.token";
const USER_KEY = "library.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (auth && token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify({ username, password }) },
    false,
  );
}

export async function login(username: string, password: string) {
  const data = await request<{ token: string }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) },
    false,
  );
  setSession(data.token, username);
  return data;
}

export function logout() {
  clearSession();
}

export function listBooks(params: {
  q?: string;
  page?: number;
  page_size?: number;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  const qs = search.toString();
  return request<PagedBooks>(`/api/books${qs ? `?${qs}` : ""}`, {}, false);
}

export function getBook(id: number) {
  return request<Book>(`/api/books/${id}`, {}, false);
}

export function createBook(input: BookInput) {
  return request<Book>("/api/books", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBook(id: number, input: BookInput) {
  return request<Book>(`/api/books/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteBook(id: number) {
  return request<{ ok: boolean }>(`/api/books/${id}`, { method: "DELETE" });
}

export function listReviews(bookId: number) {
  return request<{ items: Review[] }>(
    `/api/books/${bookId}/reviews`,
    {},
    false,
  );
}

export function createReview(
  bookId: number,
  rating: number,
  comment: string,
) {
  return request<Review>(`/api/books/${bookId}/reviews`, {
    method: "POST",
    body: JSON.stringify({ rating, comment }),
  });
}
