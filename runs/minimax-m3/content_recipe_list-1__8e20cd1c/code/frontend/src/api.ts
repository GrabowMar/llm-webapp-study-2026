import type { AuthUser, CategoryCount, Recipe, RecipeInput, RecipeList } from "./types";

const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  authenticated?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.authenticated && authToken) headers.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  if (response.status === 204) return undefined as T;

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
    const data = (payload ?? {}) as Record<string, unknown>;
    const rawErrors = data.errors;
    const fieldErrors: Record<string, string> = {};
    if (rawErrors && typeof rawErrors === "object") {
      for (const [key, value] of Object.entries(rawErrors as Record<string, unknown>)) {
        fieldErrors[key] = String(value);
      }
    }
    const message = typeof data.error === "string" ? data.error : `Request failed (${response.status}).`;
    throw new ApiError(response.status, message, fieldErrors);
  }

  return payload as T;
}

export interface RecipeQuery {
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string; token: string }>("/auth/register", {
      method: "POST",
      body: { username, password },
    }),

  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: { username, password },
    }),

  me: () => request<AuthUser>("/auth/me", { authenticated: true }),

  listRecipes: ({ category, q, page, pageSize }: RecipeQuery) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    if (page) params.set("page", String(page));
    if (pageSize) params.set("page_size", String(pageSize));
    const query = params.toString();
    return request<RecipeList>(`/recipes${query ? `?${query}` : ""}`);
  },

  categories: () => request<CategoryCount[]>("/categories"),

  getRecipe: (id: number) => request<Recipe>(`/recipes/${id}`),

  createRecipe: (input: RecipeInput) =>
    request<Recipe>("/recipes", { method: "POST", body: input, authenticated: true }),

  updateRecipe: (id: number, input: RecipeInput) =>
    request<Recipe>(`/recipes/${id}`, { method: "PUT", body: input, authenticated: true }),

  deleteRecipe: (id: number) => request<void>(`/recipes/${id}`, { method: "DELETE", authenticated: true }),
};
