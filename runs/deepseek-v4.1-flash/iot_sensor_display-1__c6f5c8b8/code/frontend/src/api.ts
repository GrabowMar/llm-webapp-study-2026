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

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "sensor-dashboard-token";
const USERNAME_KEY = "sensor-dashboard-username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function storeSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, { ...options, headers });
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
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return data as T;
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listSensors() {
  return request<{ items: Sensor[] }>("/sensors");
}

export function getSensor(id: number | string) {
  return request<Sensor>(`/sensors/${id}`);
}

export function createSensor(input: {
  name: string;
  unit: string;
  location: string;
}) {
  return request<Sensor>("/sensors", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteSensor(id: number | string) {
  return request<{ ok: boolean }>(`/sensors/${id}`, { method: "DELETE" });
}

export function listReadings(id: number | string, limit?: number) {
  const query = limit === undefined ? "" : `?limit=${limit}`;
  return request<{ items: Reading[]; total: number }>(
    `/sensors/${id}/readings${query}`,
  );
}

export function createReading(id: number | string, value: number) {
  return request<Reading>(`/sensors/${id}/readings`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}
