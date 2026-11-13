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

export interface ItemPage {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}

export interface ItemInput {
  name: string;
  sku: string;
  location: string;
  reorder_level: number | null;
  quantity?: number | null;
}

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const TOKEN_KEY = "inventory.token";
const USER_KEY = "inventory.username";

export const session = {
  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  get username(): string | null {
    return localStorage.getItem(USER_KEY);
  },
  save(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = session.token;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const obj = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    if (res.status === 401 && token && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(res.status, obj.error ?? `Request failed (${res.status})`, obj.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username?: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  listItems: (params: { q?: string; location?: string; low_stock?: boolean; page?: number; page_size?: number }) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.location) search.set("location", params.location);
    if (params.low_stock) search.set("low_stock", "true");
    if (params.page) search.set("page", String(params.page));
    if (params.page_size) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return request<ItemPage>("GET", `/items${qs ? `?${qs}` : ""}`);
  },
  locations: () => request<{ items: string[] }>("GET", "/locations"),
  getItem: (id: number) => request<Item>("GET", `/items/${id}`),
  createItem: (input: ItemInput) => request<Item>("POST", "/items", input),
  updateItem: (id: number, input: ItemInput) => request<Item>("PUT", `/items/${id}`, input),
  deleteItem: (id: number) => request<void>("DELETE", `/items/${id}`),
  listMovements: (id: number) => request<{ items: Movement[] }>("GET", `/items/${id}/movements`),
  addMovement: (id: number, delta: number, reason: string) =>
    request<Movement>("POST", `/items/${id}/movements`, { delta, reason }),
};
