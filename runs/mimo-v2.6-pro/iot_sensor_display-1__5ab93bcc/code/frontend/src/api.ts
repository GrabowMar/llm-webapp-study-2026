import type { Reading, ReadingList, Sensor, SensorList } from "./types";

const TOKEN_KEY = "sensor-dashboard.token";
const USER_KEY = "sensor-dashboard.username";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function storeAuth(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

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
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export async function register(username: string, password: string): Promise<{ id: number; username: string }> {
  return request("POST", "/api/auth/register", { username, password });
}

export async function login(username: string, password: string): Promise<{ token: string }> {
  return request("POST", "/api/auth/login", { username, password });
}

export async function listSensors(): Promise<SensorList> {
  return request("GET", "/api/sensors");
}

export async function getSensor(id: number): Promise<Sensor> {
  return request("GET", `/api/sensors/${id}`);
}

export async function createSensor(input: {
  name: string;
  unit: string;
  location: string;
}): Promise<Sensor> {
  return request("POST", "/api/sensors", input);
}

export async function deleteSensor(id: number): Promise<void> {
  await request("DELETE", `/api/sensors/${id}`);
}

export async function listReadings(id: number, limit?: number): Promise<ReadingList> {
  const query = limit === undefined ? "" : `?limit=${limit}`;
  return request("GET", `/api/sensors/${id}/readings${query}`);
}

export async function createReading(id: number, value: number): Promise<Reading> {
  return request("POST", `/api/sensors/${id}/readings`, { value });
}
