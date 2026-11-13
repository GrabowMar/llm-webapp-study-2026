export type Sensor = {
  id: number;
  name: string;
  unit: string;
  location: string;
  last_value: number | null;
  last_updated: string | null;
  owner: string;
};

export type Reading = {
  id: number;
  sensor_id: number;
  value: number;
  recorded_at: string;
};

export type SensorInput = {
  name: string;
  unit: string;
  location: string;
};

const TOKEN_KEY = "sensor-dashboard.token";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const bearer = token === undefined ? getToken() : token;
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);

  const response = await fetch(`/api${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const payload = data as { error?: string; message?: string } | null;
    const message =
      (payload && (payload.error || payload.message)) || `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string; token: string }>(
    "/auth/register",
    { method: "POST", body: JSON.stringify({ username, password }) },
    null,
  );
}

export function login(username: string, password: string) {
  return request<{ token: string; user: { id: number; username: string } }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) },
    null,
  );
}

export function logout() {
  return request<void>("/auth/logout", { method: "POST" });
}

export function me(token?: string | null) {
  return request<{ id: number; username: string }>("/me", {}, token);
}

export function listSensors() {
  return request<{ items: Sensor[] }>("/sensors");
}

export function getSensor(id: number) {
  return request<Sensor>(`/sensors/${id}`);
}

export function createSensor(input: SensorInput) {
  return request<Sensor>("/sensors", { method: "POST", body: JSON.stringify(input) });
}

export function deleteSensor(id: number) {
  return request<void>(`/sensors/${id}`, { method: "DELETE" });
}

export function listReadings(id: number, limit?: number) {
  const query = limit === undefined ? "" : `?limit=${encodeURIComponent(limit)}`;
  return request<{ items: Reading[]; total: number }>(`/sensors/${id}/readings${query}`);
}

export function createReading(id: number, value: number) {
  return request<Reading>(`/sensors/${id}/readings`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}
