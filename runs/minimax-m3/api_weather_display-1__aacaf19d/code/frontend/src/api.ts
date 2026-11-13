import type {
  Lookup,
  PagedReports,
  RecentLookups,
  ReportInput,
  WeatherReport,
} from "./types";

const TOKEN_KEY = "weather-display.token";
const SESSION_ENDED_EVENT = "weather-display:session-ended";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
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
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable, the session simply stays in memory */
  }
}

export function onSessionEnded(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(SESSION_ENDED_EVENT, handler);
  return () => window.removeEventListener(SESSION_ENDED_EVENT, handler);
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) {
    return undefined as T;
  }

  const payload = parseBody(await response.text());
  if (!response.ok) {
    const record = (payload ?? {}) as { error?: string; errors?: Record<string, string> };
    const message = record.error ?? `Request failed (${response.status})`;
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    }
    throw new ApiError(response.status, message, record.errors ?? {});
  }
  return payload as T;
}

function reportBody(input: ReportInput): Record<string, unknown> {
  const body: Record<string, unknown> = { city: input.city };
  const optional: Record<string, string> = {
    country: input.country,
    condition: input.condition,
    temperature_c: input.temperature_c,
    humidity: input.humidity,
    wind_kph: input.wind_kph,
  };
  Object.entries(optional).forEach(([key, value]) => {
    if (value.trim() !== "") {
      body[key] = key === "country" || key === "condition" ? value.trim() : Number(value);
    }
  });
  return body;
}

export async function register(username: string, password: string) {
  return request<{ id: number; username: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string) {
  return request<{ token: string; username: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function currentUser() {
  return request<{ id: number; username: string }>("/api/auth/me");
}

export async function listReports(params: {
  city?: string;
  page?: number;
  pageSize?: number;
}): Promise<PagedReports> {
  const query = new URLSearchParams();
  if (params.city) query.set("city", params.city);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("page_size", String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<PagedReports>(`/api/weather${suffix}`);
}

export async function getReport(id: number) {
  return request<WeatherReport>(`/api/weather/${id}`);
}

export async function createReport(input: ReportInput) {
  return request<WeatherReport>("/api/weather", {
    method: "POST",
    body: JSON.stringify(reportBody(input)),
  });
}

export async function updateReport(id: number, input: ReportInput) {
  return request<WeatherReport>(`/api/weather/${id}`, {
    method: "PUT",
    body: JSON.stringify(reportBody(input)),
  });
}

export async function deleteReport(id: number) {
  return request<{ deleted: boolean; id: number }>(`/api/weather/${id}`, { method: "DELETE" });
}

export async function recentLookups(limit = 5): Promise<RecentLookups> {
  return request<RecentLookups>(`/api/weather/recent?limit=${limit}`);
}

export type { Lookup, PagedReports, RecentLookups, ReportInput, WeatherReport };
