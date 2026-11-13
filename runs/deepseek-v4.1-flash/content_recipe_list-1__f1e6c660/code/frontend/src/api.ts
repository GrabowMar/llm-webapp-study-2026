export interface RecipeSummary {
  id: number;
  title: string;
  category: string;
  prep_minutes: number;
  author: string;
}

export interface Recipe extends RecipeSummary {
  ingredients: string[];
  instructions: string;
  servings: number;
  created_at: string;
}

export interface RecipeInput {
  title: string;
  category: string;
  ingredients: string[];
  instructions: string;
  prep_minutes: number;
  servings: number;
}

export interface RecipePage {
  items: RecipeSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface FieldError {
  error?: string;
  errors?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "recipe-book-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (authenticated) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const body = (data ?? {}) as FieldError;
    throw new ApiError(
      response.status,
      body.error ?? `Request failed (${response.status}).`,
      body.errors ?? {},
    );
  }
  return data as T;
}

export function listRecipes(params: {
  category?: string;
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<RecipePage> {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  const query = search.toString();
  return request<RecipePage>(`/recipes${query ? `?${query}` : ""}`);
}

export function getRecipe(id: number): Promise<Recipe> {
  return request<Recipe>(`/recipes/${id}`);
}

export function getCategories(): Promise<string[]> {
  return request<string[]>("/categories");
}

export function createRecipe(input: RecipeInput): Promise<Recipe> {
  return request<Recipe>(
    "/recipes",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export function updateRecipe(id: number, input: RecipeInput): Promise<Recipe> {
  return request<Recipe>(
    `/recipes/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
    true,
  );
}

export function deleteRecipe(id: number): Promise<void> {
  return request<void>(`/recipes/${id}`, { method: "DELETE" }, true);
}

export function login(
  username: string,
  password: string,
): Promise<{ token: string }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function register(
  username: string,
  password: string,
): Promise<{ token: string }> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function me(): Promise<{ username: string }> {
  return request("/auth/me", {}, true);
}
