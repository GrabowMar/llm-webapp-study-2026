import type {
  Book,
  BookInput,
  BookPage,
  FieldErrors,
  Review,
  ReviewPage,
} from "./types";

export class ApiError extends Error {
  status: number;
  errors: FieldErrors;

  constructor(status: number, message: string, errors: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "library.token";
const USER_KEY = "library.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  let data: unknown = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const payload = data as { error?: string; errors?: FieldErrors } | null;
    if (response.status === 401 && options.auth !== false) clearSession();
    throw new ApiError(
      response.status,
      payload?.error ?? `Request failed (${response.status})`,
      payload?.errors ?? {},
    );
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/api/auth/register", {
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
  logout: () =>
    request<{ message: string }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ id: number; username: string }>("/api/auth/me"),
  books: (q: string, page: number, pageSize: number) =>
    request<BookPage>(
      `/api/books?q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`,
    ),
  book: (id: number) => request<Book>(`/api/books/${id}`),
  createBook: (input: BookInput) =>
    request<Book>("/api/books", { method: "POST", body: input }),
  updateBook: (id: number, input: BookInput) =>
    request<Book>(`/api/books/${id}`, { method: "PUT", body: input }),
  deleteBook: (id: number) =>
    request<{ message: string; id: number }>(`/api/books/${id}`, {
      method: "DELETE",
    }),
  reviews: (bookId: number) =>
    request<ReviewPage>(`/api/books/${bookId}/reviews`),
  createReview: (bookId: number, rating: number, comment: string) =>
    request<Review>(`/api/books/${bookId}/reviews`, {
      method: "POST",
      body: { rating, comment },
    }),
};
