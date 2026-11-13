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

export type Auth = { token: string; username: string };

const TOKEN_KEY = "sensor-dashboard-token";

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // keep the default message
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function register(
  username: string,
  password: string,
): Promise<Auth> {
  await api<{ id: number; username: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return login(username, password);
}

export async function login(
  username: string,
  password: string,
): Promise<Auth> {
  const auth = await api<Auth>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  window.localStorage.setItem(TOKEN_KEY, auth.token);
  return auth;
}

export function logout(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function currentUser(): Promise<string | null> {
  if (!getToken()) return null;
  try {
    const me = await api<{ id: number; username: string }>("/api/auth/me");
    return me.username;
  } catch {
    logout();
    return null;
  }
}

export const listSensors = () => api<{ items: Sensor[] }>("/api/sensors");

export const getSensor = (id: number) => api<Sensor>(`/api/sensors/${id}`);

export const createSensor = (data: {
  name: string;
  unit: string;
  location: string;
}) =>
  api<Sensor>("/api/sensors", { method: "POST", body: JSON.stringify(data) });

export const deleteSensor = (id: number) =>
  api<void>(`/api/sensors/${id}`, { method: "DELETE" });

export const listReadings = (id: number, limit = 50) =>
  api<{ items: Reading[]; total: number }>(
    `/api/sensors/${id}/readings?limit=${limit}`,
  );

export const createReading = (id: number, value: number) =>
  api<Reading>(`/api/sensors/${id}/readings`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });

export function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

export function timeAgo(value: string | null, now: number): string {
  if (!value) return "never";
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatValue(value: number | null, unit: string): string {
  if (value === null) return "no readings yet";
  const label = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return unit ? `${label} ${unit}` : label;
}
