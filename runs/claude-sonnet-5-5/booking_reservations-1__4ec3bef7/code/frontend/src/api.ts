export type Reservation = {
  id: number;
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string | null;
  created_at: string;
};

export type Slot = { time: string; booked: number; remaining: number };

export type ReservationInput = {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes?: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }
  if (res.status === 204) return undefined as T;
  let data: { error?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

const q = (params: Record<string, string | number>) =>
  "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  me: () => request<{ username: string; is_admin: boolean }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),
  availability: (date: string) =>
    request<{ items: Slot[] }>("GET", `/availability${q({ date })}`),
  list: () => request<{ items: Reservation[]; total: number }>("GET", "/reservations"),
  create: (input: ReservationInput) => request<Reservation>("POST", "/reservations", input),
  replace: (id: number, input: ReservationInput) =>
    request<Reservation>("PUT", `/reservations/${id}`, input),
  cancel: (id: number) => request<void>("DELETE", `/reservations/${id}`),
  adminList: (date: string, page: number, pageSize: number) =>
    request<{ items: Reservation[]; total: number; page: number; page_size: number }>(
      "GET",
      `/admin/reservations${q({ date, page, page_size: pageSize })}`,
    ),
};
