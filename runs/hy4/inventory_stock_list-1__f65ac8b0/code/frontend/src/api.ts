export type Item = {
  id: number;
  name: string;
  sku: string;
  location: string;
  quantity: number;
  reorder_level: number;
  low_stock: boolean;
};

export type Movement = {
  id: number;
  item_id: number;
  delta: number;
  reason: string;
  quantity_after: number;
  created_at: string;
  username: string;
};

export type ItemList = {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
};

export type MovementList = { items: Movement[] };

export type ApiErrors = Record<string, string>;

export class ApiError extends Error {
  status: number;
  errors: ApiErrors;

  constructor(message: string, status: number, errors: ApiErrors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const TOKEN_KEY = "warehouse_token";
export const USER_KEY = "warehouse_username";

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
  return token;
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(newToken: string, username: string) {
  token = newToken;
  localStorage.setItem(TOKEN_KEY, newToken);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  token = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth && token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", 0);
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const data = payload as { error?: string; errors?: ApiErrors } | null;
    throw new ApiError(
      data?.error ?? `Request failed (${response.status}).`,
      response.status,
      data?.errors ?? {},
    );
  }
  return payload as T;
}

export const api = {
  async register(username: string, password: string): Promise<void> {
    await request("/auth/register", {
      method: "POST",
      body: { username, password },
    });
  },
  async login(username: string, password: string): Promise<string> {
    const result = await request<{ token: string }>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
    return result.token;
  },
  async me(): Promise<{ id: number; username: string }> {
    return request("/auth/me", { auth: true });
  },
  async listItems(params: {
    q?: string;
    location?: string;
    low_stock?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<ItemList> {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.location) query.set("location", params.location);
    if (params.low_stock) query.set("low_stock", "true");
    query.set("page", String(params.page ?? 1));
    query.set("page_size", String(params.page_size ?? 10));
    return request(`/items?${query.toString()}`);
  },
  async getItem(id: number): Promise<Item> {
    return request(`/items/${id}`);
  },
  async createItem(data: {
    name: string;
    sku: string;
    location: string;
    quantity: number;
    reorder_level: number;
  }): Promise<Item> {
    return request("/items", { method: "POST", body: data, auth: true });
  },
  async updateItem(
    id: number,
    data: {
      name: string;
      sku: string;
      location: string;
      reorder_level: number;
    },
  ): Promise<Item> {
    return request(`/items/${id}`, { method: "PUT", body: data, auth: true });
  },
  async deleteItem(id: number): Promise<void> {
    return request(`/items/${id}`, { method: "DELETE", auth: true });
  },
  async listMovements(id: number): Promise<MovementList> {
    return request(`/items/${id}/movements`);
  },
  async createMovement(
    id: number,
    data: { delta: number; reason?: string },
  ): Promise<Movement> {
    return request(`/items/${id}/movements`, {
      method: "POST",
      body: data,
      auth: true,
    });
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function errorFields(error: unknown): ApiErrors {
  return error instanceof ApiError ? error.errors : {};
}
