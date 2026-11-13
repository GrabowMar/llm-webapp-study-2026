export interface Store {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  distance_km: number | null;
}

export interface StorePayload {
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
}

const TOKEN_KEY = "storefinder.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init.body) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...init, headers });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export function listStores(params: {
  q?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}): Promise<{ items: Store[] }> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.lat !== undefined && params.lng !== undefined) {
    search.set("lat", String(params.lat));
    search.set("lng", String(params.lng));
    search.set("radius", String(params.radius ?? 50));
  }
  const qs = search.toString();
  return request(`/api/stores${qs ? `?${qs}` : ""}`);
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function createStore(payload: StorePayload): Promise<Store> {
  return request("/api/admin/stores", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStore(id: number, payload: StorePayload): Promise<Store> {
  return request(`/api/admin/stores/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteStore(id: number): Promise<void> {
  return request(`/api/admin/stores/${id}`, { method: "DELETE" });
}
