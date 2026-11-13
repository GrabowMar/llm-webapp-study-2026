export interface Item {
  id: number;
  name: string;
  sku: string;
  location: string;
  quantity: number;
  reorder_level: number;
  low_stock: boolean;
}

export interface Movement {
  id: number;
  item_id: number;
  delta: number;
  reason: string;
  quantity_after: number;
  created_at: string;
  username: string;
}

export interface ItemsPage {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(0, err instanceof Error ? err.message : "Something went wrong");
}

const TOKEN_KEY = "inventory_token";
const USERNAME_KEY = "inventory_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  window.dispatchEvent(new Event("session-changed"));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  window.dispatchEvent(new Event("session-changed"));
}

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const payload = (data ?? {}) as {
      error?: string;
      message?: string;
      errors?: Record<string, string>;
    };
    const message = payload.error ?? payload.message ?? `Request failed (${response.status})`;
    if (response.status === 401) clearSession();
    throw new ApiError(response.status, message, payload.errors ?? {});
  }

  return data as T;
}

export interface ItemInput {
  name?: string;
  sku?: string;
  location?: string;
  quantity?: number;
  reorder_level?: number;
}

export const api = {
  register(username: string, password: string) {
    return apiFetch<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
    });
  },

  login(username: string, password: string) {
    return apiFetch<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
  },

  listItems(
    params: {
      q?: string;
      location?: string;
      low_stock?: boolean;
      page?: number;
      page_size?: number;
    } = {},
  ) {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.location) search.set("location", params.location);
    if (params.low_stock) search.set("low_stock", "1");
    if (params.page) search.set("page", String(params.page));
    if (params.page_size) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return apiFetch<ItemsPage>(`/api/items${qs ? `?${qs}` : ""}`);
  },

  getItem(id: number) {
    return apiFetch<Item>(`/api/items/${id}`);
  },

  createItem(body: ItemInput) {
    return apiFetch<Item>("/api/items", { method: "POST", body });
  },

  updateItem(id: number, body: ItemInput) {
    return apiFetch<Item>(`/api/items/${id}`, { method: "PUT", body });
  },

  deleteItem(id: number) {
    return apiFetch<{ ok: boolean }>(`/api/items/${id}`, { method: "DELETE" });
  },

  listMovements(id: number) {
    return apiFetch<{ items: Movement[] }>(`/api/items/${id}/movements`);
  },

  createMovement(id: number, body: { delta: number; reason?: string }) {
    return apiFetch<Movement>(`/api/items/${id}/movements`, { method: "POST", body });
  },
};
