export type WeatherReport = {
  id: number;
  city: string;
  country: string | null;
  temperature_c: number;
  condition: string | null;
  humidity: number | null;
  wind_kph: number | null;
  observed_at: string;
};

export type Lookup = {
  id: number;
  city: string;
  found: boolean;
  looked_up_at: string;
};

export type PagedReports = {
  items: WeatherReport[];
  total: number;
  page: number;
  page_size: number;
};

export type ApiError = {
  error?: string;
  message?: string;
  errors?: Record<string, string>;
};

export class HttpError extends Error {
  status: number;
  data: ApiError;
  constructor(status: number, data: ApiError) {
    super(data.message || data.error || `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

let token: string | null = localStorage.getItem("weather_token");

export const getToken = () => token;
export const setToken = (value: string | null) => {
  token = value;
  if (value) localStorage.setItem("weather_token", value);
  else localStorage.removeItem("weather_token");
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new Error("Could not reach the server. Please try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, data as ApiError);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ id: number; username: string }>("/api/auth/me"),
  reports: (page = 1, pageSize = 100) =>
    request<PagedReports>(
      `/api/weather?page=${page}&page_size=${pageSize}`,
    ),
  search: (city: string) =>
    request<PagedReports>(
      `/api/weather?city=${encodeURIComponent(city)}&page_size=1`,
    ),
  getReport: (id: number) => request<WeatherReport>(`/api/weather/${id}`),
  create: (payload: ReportPayload) =>
    request<WeatherReport>("/api/weather", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: ReportPayload) =>
    request<WeatherReport>(`/api/weather/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    request<{ message: string }>(`/api/weather/${id}`, {
      method: "DELETE",
    }),
  recent: (limit = 5) =>
    request<{ items: Lookup[] }>(`/api/weather/recent?limit=${limit}`),
};

export type ReportForm = {
  city: string;
  country: string;
  temperature_c: number | "";
  condition: string;
  humidity: number | "";
  wind_kph: number | "";
};

export type ReportPayload = {
  city: string;
  country: string;
  temperature_c: number | string;
  condition: string;
  humidity?: number;
  wind_kph?: number;
};
