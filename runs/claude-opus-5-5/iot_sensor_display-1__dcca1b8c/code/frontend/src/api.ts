export interface Sensor {
  id: number;
  name: string;
  unit: string;
  location: string;
  last_value: number | null;
  last_updated: string | null;
  owner: string;
}

export interface Reading {
  id: number;
  sensor_id: number;
  value: number;
  recorded_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "sensor-dashboard-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  listSensors: () => request<{ items: Sensor[] }>("GET", "/sensors"),
  getSensor: (id: number) => request<Sensor>("GET", `/sensors/${id}`),
  createSensor: (data: { name: string; unit: string; location: string }) =>
    request<Sensor>("POST", "/sensors", data),
  deleteSensor: (id: number) => request<void>("DELETE", `/sensors/${id}`),
  listReadings: (id: number, limit = 50) =>
    request<{ items: Reading[]; total: number }>("GET", `/sensors/${id}/readings?limit=${limit}`),
  postReading: (id: number, value: number) =>
    request<Reading>("POST", `/sensors/${id}/readings`, { value }),
};
