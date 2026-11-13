export interface WeatherReport {
  id: number;
  city: string;
  country: string | null;
  temperature_c: number;
  condition: string | null;
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

export interface PagedReports {
  items: WeatherReport[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReportPayload {
  city: string;
  temperature_c: number | null;
  country: string | null;
  condition: string | null;
  humidity: number | null;
  wind_kph: number | null;
}

export class ApiError extends Error {
  readonly status: number;

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

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...options, headers });
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
    let message = `Request failed (${res.status})`;
    if (data && typeof data === "object" && "error" in data) {
      const err = (data as { error: unknown }).error;
      if (typeof err === "string") message = err;
    }
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register(username: string, password: string): Promise<{ id: number; username: string }> {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  login(username: string, password: string): Promise<{ token: string }> {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  listReports(page = 1, pageSize = 100): Promise<PagedReports> {
    return request(`/api/weather?page=${page}&page_size=${pageSize}`);
  },

  searchCity(city: string): Promise<PagedReports> {
    return request(`/api/weather?city=${encodeURIComponent(city)}&page=1&page_size=10`);
  },

  recentLookups(limit = 5): Promise<{ items: Lookup[] }> {
    return request(`/api/weather/recent?limit=${limit}`);
  },

  createReport(payload: ReportPayload): Promise<WeatherReport> {
    return request("/api/weather", { method: "POST", body: JSON.stringify(payload) });
  },

  updateReport(id: number, payload: ReportPayload): Promise<WeatherReport> {
    return request(`/api/weather/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },

  deleteReport(id: number): Promise<void> {
    return request(`/api/weather/${id}`, { method: "DELETE" });
  },
};
