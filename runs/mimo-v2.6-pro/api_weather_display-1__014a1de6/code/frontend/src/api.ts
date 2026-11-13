import type { Lookup, Paged, ReportInput, WeatherReport } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "weather.token";
const USERNAME_KEY = "weather.username";

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

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
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export async function register(username: string, password: string): Promise<void> {
  await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data.token;
}

export async function fetchReports(
  page: number,
  pageSize: number,
  city?: string,
): Promise<Paged<WeatherReport>> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (city) params.set("city", city);
  return request<Paged<WeatherReport>>(`/api/weather?${params.toString()}`);
}

export async function fetchRecentLookups(limit: number): Promise<Lookup[]> {
  const data = await request<{ items: Lookup[] }>(`/api/weather/recent?limit=${limit}`);
  return data.items;
}

export async function createReport(input: ReportInput): Promise<WeatherReport> {
  return request<WeatherReport>("/api/weather", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateReport(id: number, input: ReportInput): Promise<WeatherReport> {
  return request<WeatherReport>(`/api/weather/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteReport(id: number): Promise<void> {
  await request(`/api/weather/${id}`, { method: "DELETE" });
}
