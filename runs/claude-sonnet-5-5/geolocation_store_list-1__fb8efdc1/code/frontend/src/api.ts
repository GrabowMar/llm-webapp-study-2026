export interface Store {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  distance_km: number | null;
}

export interface StoreInput {
  name: string;
  address: string;
  phone?: string;
  latitude: number | string;
  longitude: number | string;
}

export class ApiError extends Error {
  status: number;
  details: Record<string, string>;
  constructor(status: number, message: string, details: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const TOKEN_KEY = "store-finder-token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  let data: { error?: string; details?: Record<string, string> } = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.details);
  return data as T;
}

export interface Query {
  q?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}

export function listStores(query: Query): Promise<{ items: Store[] }> {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.lat !== undefined && query.lng !== undefined) {
    p.set("lat", String(query.lat));
    p.set("lng", String(query.lng));
    if (query.radius !== undefined) p.set("radius", String(query.radius));
  }
  const qs = p.toString();
  return request("GET", `/api/stores${qs ? `?${qs}` : ""}`);
}

export const login = (username: string, password: string) =>
  request<{ token: string }>("POST", "/api/auth/login", { username, password });

const toPayload = (s: StoreInput) => ({
  name: s.name,
  address: s.address,
  ...(s.phone ? { phone: s.phone } : {}),
  latitude: s.latitude === "" ? null : Number(s.latitude),
  longitude: s.longitude === "" ? null : Number(s.longitude),
});

export const createStore = (s: StoreInput) => request<Store>("POST", "/api/admin/stores", toPayload(s));
export const updateStore = (id: number, s: StoreInput) =>
  request<Store>("PUT", `/api/admin/stores/${id}`, toPayload(s));
export const deleteStore = (id: number) => request<void>("DELETE", `/api/admin/stores/${id}`);
