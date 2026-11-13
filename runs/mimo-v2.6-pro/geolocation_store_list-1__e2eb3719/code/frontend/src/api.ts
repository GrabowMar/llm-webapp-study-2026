import type { Store, StoreInput } from "./types";

const TOKEN_KEY = "store-finder.token";
const USER_KEY = "store-finder.username";

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
  return token;
}

export function getSavedUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(nextToken: string | null, username: string | null = null): void {
  token = nextToken;
  if (nextToken !== null) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, username ?? "");
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (token !== null) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers, signal });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = data as { error?: string; fields?: Record<string, string> } | null;
    throw new ApiError(
      res.status,
      body?.error ?? `Request failed (${res.status})`,
      body?.fields,
    );
  }
  return data as T;
}

export const api = {
  listStores(params: Record<string, string>, signal?: AbortSignal): Promise<Store[]> {
    const qs = new URLSearchParams(params).toString();
    return request<{ items: Store[] }>(`/api/stores${qs ? `?${qs}` : ""}`, {}, signal).then(
      (body) => body.items,
    );
  },

  login(username: string, password: string): Promise<{ token: string }> {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  createStore(input: StoreInput): Promise<Store> {
    return request("/api/admin/stores", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateStore(id: number, input: StoreInput): Promise<Store> {
    return request(`/api/admin/stores/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  deleteStore(id: number): Promise<void> {
    return request(`/api/admin/stores/${id}`, { method: "DELETE" });
  },
};
