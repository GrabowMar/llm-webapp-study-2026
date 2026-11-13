export type Report = {
  id: number;
  city: string;
  country: string | null;
  temperature_c: number;
  condition: string | null;
  humidity: number | null;
  wind_kph: number | null;
  observed_at: string;
};

export type Lookup = { id: number; city: string; found: boolean; looked_up_at: string };

export type ReportInput = {
  city: string;
  country: string | null;
  temperature_c: number | null;
  condition: string | null;
  humidity: number | null;
  wind_kph: number | null;
};

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;
  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "weather_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  search: (city: string) =>
    request<{ items: Report[] }>("GET", `/weather?city=${encodeURIComponent(city)}`),
  list: (page: number, pageSize: number) =>
    request<{ items: Report[]; total: number; page: number; page_size: number }>(
      "GET",
      `/weather?page=${page}&page_size=${pageSize}`,
    ),
  recent: (limit = 5) => request<{ items: Lookup[] }>("GET", `/weather/recent?limit=${limit}`),
  create: (r: ReportInput) => request<Report>("POST", "/weather", r),
  replace: (id: number, r: ReportInput) => request<Report>("PUT", `/weather/${id}`, r),
  remove: (id: number) => request<void>("DELETE", `/weather/${id}`),
};
