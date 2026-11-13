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

export interface ItemParams {
  q?: string;
  location?: string;
  low_stock?: boolean;
  page?: number;
  page_size?: number;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "inventory_token";
const USER_KEY = "inventory_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
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
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = data as { error?: string } | null;
    if (res.status === 401 && getToken()) {
      clearSession();
      window.dispatchEvent(new Event("inventory:unauthorized"));
    }
    throw new ApiError(res.status, err?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function listItems(params: ItemParams): Promise<ItemsPage> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.location) query.set("location", params.location);
  if (params.low_stock) query.set("low_stock", "true");
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const qs = query.toString();
  return request(`/api/items${qs ? `?${qs}` : ""}`);
}

export function getItem(id: number): Promise<Item> {
  return request(`/api/items/${id}`);
}

export interface ItemInput {
  name: string;
  sku: string;
  location: string;
  quantity?: number;
  reorder_level: number;
}

export function createItem(input: ItemInput): Promise<Item> {
  return request("/api/items", { method: "POST", body: JSON.stringify(input) });
}

export function updateItem(id: number, input: ItemInput): Promise<Item> {
  return request(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteItem(id: number): Promise<{ ok: boolean }> {
  return request(`/api/items/${id}`, { method: "DELETE" });
}

export function listMovements(id: number): Promise<{ items: Movement[] }> {
  return request(`/api/items/${id}/movements`);
}

export function createMovement(
  id: number,
  delta: number,
  reason: string,
): Promise<Movement> {
  return request(`/api/items/${id}/movements`, {
    method: "POST",
    body: JSON.stringify({ delta, reason }),
  });
}

export function register(username: string, password: string): Promise<unknown> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string; username: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setSession(data.token, data.username);
  return data.username;
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  clearSession();
}
