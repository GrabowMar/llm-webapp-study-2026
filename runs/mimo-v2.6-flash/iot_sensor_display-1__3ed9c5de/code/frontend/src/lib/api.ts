export type Sensor = {
  id: number;
  name: string;
  unit: string;
  location: string;
  last_value: number | string | null;
  last_updated: string | null;
  owner: string;
};

export type Reading = {
  id: number;
  sensor_id: number;
  value: number | string;
  recorded_at: string;
};

export type Auth = { token: string; username: string };

const AUTH_KEY = "sensor-dashboard.auth";

let auth: Auth | null = null;
try {
  const raw = localStorage.getItem(AUTH_KEY);
  if (raw) auth = JSON.parse(raw) as Auth;
} catch {
  auth = null;
}

export function getAuth(): Auth | null {
  return auth;
}

export function setAuth(next: Auth | null): void {
  auth = next;
  try {
    if (next) localStorage.setItem(AUTH_KEY, JSON.stringify(next));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* storage unavailable: keep in-memory session */
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) headers.set("Authorization", `Bearer ${auth.token}`);

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status})`;
    if (data && typeof data === "object" && "error" in data) {
      const reason = (data as { error: unknown }).error;
      if (typeof reason === "string" && reason) message = reason;
    }
    throw new ApiError(message, res.status);
  }
  return data as T;
}

function post<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export const api = {
  register: (username: string, password: string) =>
    post<{ id: number; username: string }>("/api/auth/register", {
      username,
      password,
    }),

  login: (username: string, password: string) =>
    post<{ token: string }>("/api/auth/login", { username, password }),

  getSensors: () => request<{ items: Sensor[] }>("/api/sensors"),

  createSensor: (input: { name: string; unit: string; location: string }) =>
    post<Sensor>("/api/sensors", input),

  getSensor: (id: number) => request<Sensor>(`/api/sensors/${id}`),

  deleteSensor: (id: number) =>
    request<{ ok: boolean }>(`/api/sensors/${id}`, { method: "DELETE" }),

  getReadings: (id: number, limit?: number) =>
    request<{ items: Reading[]; total: number }>(
      `/api/sensors/${id}/readings${limit === undefined ? "" : `?limit=${limit}`}`,
    ),

  createReading: (id: number, value: number | string) =>
    post<Reading>(`/api/sensors/${id}/readings`, { value }),
};
