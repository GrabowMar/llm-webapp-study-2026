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

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReportInput {
  city: string;
  country: string | null;
  temperature_c: number | string | null;
  condition: string | null;
  humidity: number | string | null;
  wind_kph: number | string | null;
}

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(method: string, path: string, options: { token?: string | null; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const obj = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(res.status, obj.error ?? `Request failed (${res.status})`, obj.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { body: { username, password } }),
  login: (username: string, password: string) =>
    request<{ token: string; username?: string }>("POST", "/auth/login", { body: { username, password } }),
  me: (token: string) => request<{ id: number; username: string }>("GET", "/auth/me", { token }),
  logout: (token: string) => request<void>("POST", "/auth/logout", { token }),
  search: (city: string) =>
    request<Page<WeatherReport>>("GET", `/weather?city=${encodeURIComponent(city)}`),
  list: (page: number, pageSize: number) =>
    request<Page<WeatherReport>>("GET", `/weather?page=${page}&page_size=${pageSize}`),
  recent: (limit = 5) => request<{ items: Lookup[] }>("GET", `/weather/recent?limit=${limit}`),
  create: (token: string, body: ReportInput) => request<WeatherReport>("POST", "/weather", { token, body }),
  update: (token: string, id: number, body: ReportInput) =>
    request<WeatherReport>("PUT", `/weather/${id}`, { token, body }),
  remove: (token: string, id: number) => request<void>("DELETE", `/weather/${id}`, { token }),
};
