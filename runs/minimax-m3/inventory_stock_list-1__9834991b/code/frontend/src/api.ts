import type {
  Item,
  ItemInput,
  ItemPageResponse,
  Movement,
  MovementInput,
  MovementPageResponse,
  NewItemInput,
} from "./types";

const TOKEN_STORAGE_KEY = "inventory.token";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    return;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; message?: string; errors?: Record<string, string> };
    const message = body.error || body.message || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, body.errors ?? {});
  }

  return payload as T;
}

export interface ItemQuery {
  q?: string;
  location?: string;
  low_stock?: boolean;
  page?: number;
  page_size?: number;
}

export const api = {
  register(username: string, password: string) {
    return request<{ token: string; username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  login(username: string, password: string) {
    return request<{ token: string; username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  logout() {
    return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },

  me() {
    return request<{ id: number; username: string }>("/api/me");
  },

  listItems(query: ItemQuery = {}) {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.location) params.set("location", query.location);
    if (query.low_stock) params.set("low_stock", "true");
    if (query.page) params.set("page", String(query.page));
    if (query.page_size) params.set("page_size", String(query.page_size));
    const search = params.toString();
    return request<ItemPageResponse>(`/api/items${search ? `?${search}` : ""}`);
  },

  getItem(id: number) {
    return request<Item>(`/api/items/${id}`);
  },

  createItem(input: NewItemInput) {
    return request<Item>("/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateItem(id: number, input: ItemInput) {
    return request<Item>(`/api/items/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  deleteItem(id: number) {
    return request<{ deleted: boolean; id: number }>(`/api/items/${id}`, { method: "DELETE" });
  },

  listMovements(id: number) {
    return request<MovementPageResponse>(`/api/items/${id}/movements`);
  },

  createMovement(id: number, input: MovementInput) {
    return request<Movement>(`/api/items/${id}/movements`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
