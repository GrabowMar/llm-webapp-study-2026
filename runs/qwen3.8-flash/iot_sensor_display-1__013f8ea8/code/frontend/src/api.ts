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

const TOKEN_KEY = "sensor-dashboard-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && token) setToken(null);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data.error === "string" ? data.error : `request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<void>("POST", "/auth/register", { username, password }, false),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }, false),
  me: () => request<{ username: string }>("GET", "/auth/me"),
  listSensors: () => request<{ items: Sensor[] }>("GET", "/sensors", undefined, false),
  getSensor: (id: number) => request<Sensor>("GET", `/sensors/${id}`, undefined, false),
  createSensor: (name: string, unit: string, location: string) =>
    request<Sensor>("POST", "/sensors", { name, unit, location }),
  deleteSensor: (id: number) => request<void>("DELETE", `/sensors/${id}`),
  listReadings: (id: number, limit = 100) =>
    request<{ items: Reading[]; total: number }>(
      "GET",
      `/sensors/${id}/readings?limit=${limit}`,
      undefined,
      false,
    ),
  createReading: (id: number, value: number) =>
    request<Reading>("POST", `/sensors/${id}/readings`, { value }),
};
