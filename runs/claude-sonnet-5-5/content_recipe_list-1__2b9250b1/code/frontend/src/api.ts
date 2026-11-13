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
  category: string;
  prep_minutes: number | null;
  servings: number | null;
  ingredients: string[];
  instructions: string;
};

export type RecipePage = {
  items: RecipeSummary[];
  total: number;
  page: number;
  page_size: number;
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "recipe-token";
const USER_KEY = "recipe-user";

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get username() {
    return localStorage.getItem(USER_KEY);
  },
  set(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = session.token;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/api/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("POST", "/api/auth/login", { username, password }),
  me: () => request<{ username: string }>("GET", "/api/auth/me"),
  categories: () => request<{ items: string[] }>("GET", "/api/categories"),
  list: (params: { category: string; q: string; page: number; page_size: number }) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.q) qs.set("q", params.q);
    qs.set("page", String(params.page));
    qs.set("page_size", String(params.page_size));
    return request<RecipePage>("GET", `/api/recipes?${qs}`);
  },
  get: (id: string | number) => request<Recipe>("GET", `/api/recipes/${id}`),
  create: (input: RecipeInput) => request<Recipe>("POST", "/api/recipes", input),
  update: (id: string | number, input: RecipeInput) => request<Recipe>("PUT", `/api/recipes/${id}`, input),
  remove: (id: string | number) => request<void>("DELETE", `/api/recipes/${id}`),
};
