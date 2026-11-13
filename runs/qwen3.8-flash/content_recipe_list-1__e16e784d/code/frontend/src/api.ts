export interface RecipeListItem {
  id: number;
  title: string;
  category: string;
  prep_minutes: number;
  author: string;
}

export interface Recipe extends RecipeListItem {
  ingredients: string[];
  instructions: string;
  servings: number;
  created_at: string;
}

export interface RecipePayload {
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number;
  servings: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "recipebook.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const obj = data as { error?: string } | null;
    throw new ApiError(obj?.error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string; token: string }>("/auth/register", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  me: () => request<{ username: string }>("/auth/me"),
  logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),

  listRecipes: (params: {
    category?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.q) qs.set("q", params.q);
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<Page<RecipeListItem>>(`/recipes${suffix}`);
  },
  getRecipe: (id: number) => request<Recipe>(`/recipes/${id}`),
  createRecipe: (payload: RecipePayload) =>
    request<Recipe>("/recipes", { method: "POST", body: payload }),
  updateRecipe: (id: number, payload: RecipePayload) =>
    request<Recipe>(`/recipes/${id}`, { method: "PUT", body: payload }),
  deleteRecipe: (id: number) =>
    request<void>(`/recipes/${id}`, { method: "DELETE" }),
  categories: () => request<{ categories: string[] }>("/categories"),
};
