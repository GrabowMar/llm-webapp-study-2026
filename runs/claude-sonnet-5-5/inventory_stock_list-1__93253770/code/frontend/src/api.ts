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
  username: string | null;
};

export type ItemPage = {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
};

export type ItemInput = {
  name: string;
  sku: string;
  location: string;
  reorder_level: number | string;
  quantity?: number | string;
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "inventory.token";
const USER_KEY = "inventory.username";

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

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
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
    throw new ApiError(0, "Could not reach the server", {});
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/")) onUnauthorized();
    const fields: Record<string, string> =
      data && typeof data.errors === "object" && data.errors ? data.errors : {};
    throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`, fields);
  }
  return data as T;
}

function toNumber(v: number | string | undefined): number | string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return /^-?\d+$/.test(t) ? Number(t) : t === "" ? undefined : t;
  }
  return v;
}

function itemPayload(input: ItemInput) {
  return {
    name: input.name,
    sku: input.sku,
    location: input.location,
    reorder_level: toNumber(input.reorder_level),
    ...(input.quantity !== undefined ? { quantity: toNumber(input.quantity) } : {}),
  };
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("POST", "/auth/login", { username, password }),
  listItems: (params: Record<string, string>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return request<ItemPage>("GET", `/items?${qs.toString()}`);
  },
  locations: () => request<{ items: string[] }>("GET", "/locations"),
  getItem: (id: string | number) => request<Item>("GET", `/items/${id}`),
  createItem: (input: ItemInput) => request<Item>("POST", "/items", itemPayload(input)),
  updateItem: (id: number, input: ItemInput) =>
    request<Item>("PUT", `/items/${id}`, itemPayload(input)),
  deleteItem: (id: number) => request<void>("DELETE", `/items/${id}`),
  movements: (id: string | number) =>
    request<{ items: Movement[] }>("GET", `/items/${id}/movements`),
  addMovement: (id: number, delta: number, reason: string) =>
    request<Movement>("POST", `/items/${id}/movements`, { delta, reason }),
};
