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

export interface BookList {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReviewList {
  items: Review[];
}

export interface AuthState {
  username: string | null;
  token: string | null;
}

export function readAuth(): AuthState {
  const raw = localStorage.getItem("auth");
  if (!raw) return { username: null, token: null };
  try {
    return JSON.parse(raw);
  } catch {
    return { username: null, token: null };
  }
}

export function writeAuth(auth: AuthState) {
  if (auth.token && auth.username) {
    localStorage.setItem("auth", JSON.stringify(auth));
  } else {
    localStorage.removeItem("auth");
  }
}

function authHeaders(): HeadersInit {
  const { token } = readAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: { error?: string; fields?: Record<string, string> } = {};
    try {
      body = await res.json();
    } catch {
      // ignore parse errors
    }
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status, body.fields || {});
  }
  return res.json() as Promise<T>;
}

export function apiLogin(username: string, password: string) {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then((r) => handle<{ token: string }>(r));
}

export function apiRegister(username: string, password: string) {
  return fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).then((r) => handle<{ username: string }>(r));
}

export function apiBooks(q: string, page: number, pageSize: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return fetch(`/api/books?${params.toString()}`).then((r) => handle<BookList>(r));
}

export function apiBook(id: number) {
  return fetch(`/api/books/${id}`).then((r) => handle<Book>(r));
}

export function apiCreateBook(input: { title: string; author: string; year: number | null; isbn: string | null }) {
  return fetch("/api/books", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<Book>(r));
}

export function apiUpdateBook(
  id: number,
  input: { title: string; author: string; year: number | null; isbn: string | null }
) {
  return fetch(`/api/books/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<Book>(r));
}

export function apiDeleteBook(id: number) {
  return fetch(`/api/books/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then((r) => handle<{ deleted: boolean }>(r));
}

export function apiReviews(bookId: number) {
  return fetch(`/api/books/${bookId}/reviews`).then((r) => handle<ReviewList>(r));
}

export function apiCreateReview(bookId: number, input: { rating: number; comment: string }) {
  return fetch(`/api/books/${bookId}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<Review>(r));
}
