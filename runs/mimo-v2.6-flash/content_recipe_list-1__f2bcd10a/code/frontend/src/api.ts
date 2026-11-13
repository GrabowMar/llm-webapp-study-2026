export type RecipeListItem = {
  id: number;
  title: string;
  category: string;
  prep_minutes: number | null;
  author: string;
};

export type Recipe = {
  id: number;
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number | null;
  servings: number | null;
  created_at: string;
  author: string;
};

export type RecipeListPage = {
  items: RecipeListItem[];
  total: number;
  page: number;
  page_size: number;
};

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  errors: FieldErrors;

  constructor(status: number, message: string, errors: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const payload = data as { error?: string; errors?: FieldErrors } | null;
    throw new ApiError(
      response.status,
      payload?.error ?? `Request failed (${response.status}).`,
      payload?.errors ?? {},
    );
  }
  return data as T;
}

const TOKEN_KEY = "recipe_book_token";
const USER_KEY = "recipe_book_username";

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function loadUsername(): string | null {
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
