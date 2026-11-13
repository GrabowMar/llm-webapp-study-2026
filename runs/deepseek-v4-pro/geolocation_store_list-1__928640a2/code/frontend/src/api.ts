import type { Store, StoreInput } from "./types";

const TOKEN_KEY = "store_finder_token";

export interface ApiError extends Error {
  status?: number;
  data?: { error?: string; errors?: Record<string, string> };
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(
      data?.error || data?.message || `Request failed (${res.status})`,
    ) as ApiError;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export function listStores(params: {
  q?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}): Promise<{ items: Store[] }> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.lat != null) qs.set("lat", String(params.lat));
  if (params.lng != null) qs.set("lng", String(params.lng));
  if (params.radius != null) qs.set("radius", String(params.radius));
  const q = qs.toString();
  return request<{ items: Store[] }>(`/api/stores${q ? `?${q}` : ""}`);
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function createStore(input: StoreInput): Promise<Store> {
  return request<Store>("/api/admin/stores", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateStore(id: number, input: StoreInput): Promise<Store> {
  return request<Store>(`/api/admin/stores/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteStore(id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/stores/${id}`, { method: "DELETE" });
}
