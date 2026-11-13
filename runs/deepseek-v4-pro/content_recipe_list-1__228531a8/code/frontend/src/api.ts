export interface RecipeListItem {
  id: number;
  title: string;
  category: string;
  prep_minutes: number | null;
  author: string;
}

export interface Recipe extends RecipeListItem {
  ingredients: string[];
  instructions: string;
  servings: number | null;
  created_at: string;
}

export interface RecipeListResponse {
  items: RecipeListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface RecipeInput {
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number | null;
  servings: number | null;
}

const TOKEN_KEY = "recipebook_token";
const USER_KEY = "recipebook_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): string | null {
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 204) {
    return undefined as T;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? "Request failed.", res.status);
  }
  return data as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  listRecipes: (params: {
    category?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params.category) sp.set("category", params.category);
    if (params.q) sp.set("q", params.q);
    if (params.page) sp.set("page", String(params.page));
    if (params.page_size) sp.set("page_size", String(params.page_size));
    const qs = sp.toString();
    return request<RecipeListResponse>(`/recipes${qs ? `?${qs}` : ""}`);
  },
  getRecipe: (id: number) => request<Recipe>(`/recipes/${id}`),
  createRecipe: (input: RecipeInput) =>
    request<Recipe>("/recipes", { method: "POST", body: JSON.stringify(input) }),
  updateRecipe: (id: number, input: RecipeInput) =>
    request<Recipe>(`/recipes/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteRecipe: (id: number) =>
    request<void>(`/recipes/${id}`, { method: "DELETE" }),
  categories: () => request<{ categories: string[] }>("/categories"),
};
