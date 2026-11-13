export type RecipeSummary = {
  id: number;
  title: string;
  category: string;
  prep_minutes: number;
  author: string;
};

export type Recipe = RecipeSummary & {
  ingredients: string[];
  instructions: string;
  servings: number;
  created_at: string;
};

export type RecipeInput = {
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number | null;
  servings: number | null;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const TOKEN_KEY = "recipe-book-token";
const USER_KEY = "recipe-book-user";

export function loadSession(): { token: string; username: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  return token && username ? { token, username } : null;
}

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const obj = (data && typeof data === "object" ? data : {}) as {
      error?: string;
      errors?: Record<string, string>;
    };
    if (res.status === 401 && token && path !== "/auth/login") unauthorizedHandler?.();
    throw new ApiError(res.status, obj.error || `Request failed (${res.status}).`, obj.errors || {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  categories: () => request<{ items: string[] }>("GET", "/categories"),
  listRecipes: (params: { category?: string; q?: string; page?: number; page_size?: number }) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.q) qs.set("q", params.q);
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    const s = qs.toString();
    return request<Page<RecipeSummary>>("GET", `/recipes${s ? `?${s}` : ""}`);
  },
  getRecipe: (id: number) => request<Recipe>("GET", `/recipes/${id}`),
  createRecipe: (input: RecipeInput) => request<Recipe>("POST", "/recipes", input),
  updateRecipe: (id: number, input: RecipeInput) => request<Recipe>("PUT", `/recipes/${id}`, input),
  deleteRecipe: (id: number) => request<void>("DELETE", `/recipes/${id}`),
};
