export type Store = {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  distance_km: number | null;
};

export type StoreInput = {
  name: string;
  address: string;
  phone?: string;
  latitude: number | string;
  longitude: number | string;
};

export type Session = { token: string; username: string; is_admin: boolean };

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "Network error. Please check your connection.");
  }
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(res.status, b.error || `Request failed (${res.status}).`, b.errors || {});
  }
  return body as T;
}

export type StoreQuery = { q?: string; lat?: number; lng?: number; radius?: number };

export function listStores(query: StoreQuery, signal?: AbortSignal): Promise<{ items: Store[] }> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.lat !== undefined && query.lng !== undefined) {
    params.set("lat", String(query.lat));
    params.set("lng", String(query.lng));
    if (query.radius !== undefined) params.set("radius", String(query.radius));
  }
  const qs = params.toString();
  return request(`/api/stores${qs ? `?${qs}` : ""}`, { signal });
}

export function login(username: string, password: string): Promise<Session> {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function me(token: string): Promise<{ username: string; is_admin: boolean }> {
  return request("/api/auth/me", {}, token);
}

export function logout(token: string): Promise<void> {
  return request("/api/auth/logout", { method: "POST" }, token);
}

export function createStore(token: string, input: StoreInput): Promise<Store> {
  return request("/api/admin/stores", { method: "POST", body: JSON.stringify(input) }, token);
}

export function updateStore(token: string, id: number, input: StoreInput): Promise<Store> {
  return request(`/api/admin/stores/${id}`, { method: "PUT", body: JSON.stringify(input) }, token);
}

export function deleteStore(token: string, id: number): Promise<void> {
  return request(`/api/admin/stores/${id}`, { method: "DELETE" }, token);
}
