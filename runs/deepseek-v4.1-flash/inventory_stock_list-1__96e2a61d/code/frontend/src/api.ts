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

export interface PagedItems {
  items: Item[];
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

const TOKEN_KEY = "inventory.token";
const USER_KEY = "inventory.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function storeSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, { ...options, headers });
  if (response.status === 204) {
    return undefined as T;
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
    let message = `Request failed (${response.status}).`;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (typeof record.error === "string") {
        message = record.error;
      } else if (typeof record.message === "string") {
        message = record.message;
      } else if (Array.isArray(record.errors) && record.errors.length > 0) {
        message = record.errors
          .map((entry) =>
            typeof entry === "string"
              ? entry
              : typeof entry === "object" && entry && "message" in entry
                ? String((entry as Record<string, unknown>).message)
                : JSON.stringify(entry),
          )
          .join(" ");
      }
    }
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string; username?: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listItems(params: {
  q?: string;
  location?: string;
  low_stock?: boolean;
  page?: number;
  page_size?: number;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.location) search.set("location", params.location);
  if (params.low_stock) search.set("low_stock", "true");
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  const query = search.toString();
  return request<PagedItems>(`/items${query ? `?${query}` : ""}`);
}

export function listLocations() {
  return request<{ items: string[] }>("/locations");
}

export function getItem(id: number | string) {
  return request<Item>(`/items/${id}`);
}

export interface ItemInput {
  name: string;
  sku: string;
  location: string;
  reorder_level: number;
}

export function createItem(input: ItemInput & { quantity: number }) {
  return request<Item>("/items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateItem(id: number | string, input: ItemInput) {
  return request<Item>(`/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteItem(id: number | string) {
  return request<void>(`/items/${id}`, { method: "DELETE" });
}

export function listMovements(id: number | string) {
  return request<{ items: Movement[] }>(`/items/${id}/movements`);
}

export function createMovement(
  id: number | string,
  delta: number,
  reason: string,
) {
  return request<Movement>(`/items/${id}/movements`, {
    method: "POST",
    body: JSON.stringify({ delta, reason }),
  });
}
