export interface Report {
  id: number;
  city: string;
  country: string | null;
  temperature_c: number;
  condition: string;
  humidity: number | null;
  wind_kph: number | null;
  observed_at: string;
}

export interface Lookup {
  id: number;
  city: string;
  found: boolean;
  looked_up_at: string;
}

export interface ReportList {
  items: Report[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReportInput {
  city: string;
  country: string;
  temperature_c: string;
  condition: string;
  humidity: string;
  wind_kph: string;
}

const TOKEN_KEY = "weather.token";
const USERNAME_KEY = "weather.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export class ApiError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new ApiError(msg);
  }
  return body as T;
}

export function register(username: string, password: string) {
  return request<{ status: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string) {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data.token;
}

export function searchCity(city: string) {
  return request<ReportList>(`/api/weather?city=${encodeURIComponent(city)}`);
}

export function listReports(page: number, pageSize: number) {
  return request<ReportList>(`/api/weather?page=${page}&page_size=${pageSize}`);
}

export function recentLookups(limit: number) {
  return request<{ items: Lookup[] }>(`/api/weather/recent?limit=${limit}`);
}

export function toPayload(input: ReportInput) {
  const payload: Record<string, unknown> = {
    city: input.city,
    temperature_c: input.temperature_c === "" ? null : Number(input.temperature_c),
    condition: input.condition,
  };
  if (input.country.trim() !== "") payload.country = input.country.trim();
  if (input.humidity.trim() !== "") payload.humidity = Number(input.humidity);
  if (input.wind_kph.trim() !== "") payload.wind_kph = Number(input.wind_kph);
  return payload;
}

export function createReport(input: ReportInput) {
  return request<Report>("/api/weather", {
    method: "POST",
    body: JSON.stringify(toPayload(input)),
  });
}

export function updateReport(id: number, input: ReportInput) {
  return request<Report>(`/api/weather/${id}`, {
    method: "PUT",
    body: JSON.stringify(toPayload(input)),
  });
}

export function deleteReport(id: number) {
  return request<{ status: string }>(`/api/weather/${id}`, { method: "DELETE" });
}
