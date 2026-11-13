export type ListItem = {
  id: number;
  title: string;
  category: string;
  prep_minutes: number;
  author: string;
};

export type Recipe = {
  id: number;
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number;
  servings: number;
  created_at: string;
  author: string;
};

export type PagedRecipes = {
  items: ListItem[];
  total: number;
  page: number;
  page_size: number;
};

export type RecipeInput = {
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number;
  servings: number;
};

export type ApiErrors = Record<string, string> & { general?: string };

export class ApiError extends Error {
  status: number;
  errors: ApiErrors;

  constructor(status: number, message: string, errors: ApiErrors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "recipe-book-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (authenticated) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Please try again.");
  }

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const body = (data ?? {}) as {
      message?: string;
      error?: string;
      errors?: Record<string, string>;
    };
    const message =
      body.message ??
      body.error ??
      (response.status === 401
        ? "Please sign in to continue."
        : "Something went wrong. Please try again.");
    const errors: ApiErrors = { ...(body.errors ?? {}) };
    throw new ApiError(response.status, message, errors);
  }
  return data as T;
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ id: number; username: string }>("/auth/me", {}, true),

  categories: () => request<string[]>("/categories"),

  listRecipes: (params: {
    category?: string;
    q?: string;
    page?: number;
    page_size?: number;
  }) => {
    const search = new URLSearchParams();
    if (params.category) search.set("category", params.category);
    if (params.q) search.set("q", params.q);
    if (params.page) search.set("page", String(params.page));
    if (params.page_size) search.set("page_size", String(params.page_size));
    const query = search.toString();
    return request<PagedRecipes>(`/recipes${query ? `?${query}` : ""}`);
  },

  getRecipe: (id: number) => request<Recipe>(`/recipes/${id}`),

  createRecipe: (input: RecipeInput) =>
    request<Recipe>(
      "/recipes",
      { method: "POST", body: JSON.stringify(input) },
      true,
    ),

  updateRecipe: (id: number, input: RecipeInput) =>
    request<Recipe>(
      `/recipes/${id}`,
      { method: "PUT", body: JSON.stringify(input) },
      true,
    ),

  deleteRecipe: (id: number) =>
    request<{ id: number }>(`/recipes/${id}`, { method: "DELETE" }, true),
};
