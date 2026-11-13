import type { Recipe, RecipeInput, RecipePage } from "./types";

const TOKEN_KEY = "recipe_book_token";
const USERNAME_KEY = "recipe_book_username";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(message: string, status: number, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function storeSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(
      body.error ?? `Request failed with status ${res.status}`,
      res.status,
      body.errors ?? {},
    );
  }
  return data as T;
}

export type ListParams = {
  category?: string;
  q?: string;
  page?: number;
  page_size?: number;
};

export const api = {
  register(username: string, password: string) {
    return request<{ token: string; username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  login(username: string, password: string) {
    return request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  listRecipes(params: ListParams) {
    const sp = new URLSearchParams();
    if (params.category) sp.set("category", params.category);
    if (params.q) sp.set("q", params.q);
    if (params.page !== undefined) sp.set("page", String(params.page));
    if (params.page_size !== undefined) sp.set("page_size", String(params.page_size));
    const qs = sp.toString();
    return request<RecipePage>(`/api/recipes${qs ? `?${qs}` : ""}`);
  },

  listCategories() {
    return request<{ categories: string[] }>("/api/categories");
  },

  getRecipe(id: number) {
    return request<Recipe>(`/api/recipes/${id}`);
  },

  createRecipe(input: RecipeInput) {
    return request<Recipe>("/api/recipes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateRecipe(id: number, input: RecipeInput) {
    return request<Recipe>(`/api/recipes/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  deleteRecipe(id: number) {
    return request<void>(`/api/recipes/${id}`, { method: "DELETE" });
  },
};
