export interface Reservation {
  id: number;
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string | null;
  created_at: string;
  username?: string;
}

export interface ReservationInput {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes?: string;
}

export interface Slot {
  time: string;
  booked: number;
  remaining: number;
}

export interface Session {
  token: string;
  username: string;
  is_admin: boolean;
}

export class ApiError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }
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
    const obj = (data ?? {}) as { error?: string; details?: Record<string, unknown> };
    if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, obj.error || `Request failed (${res.status})`, obj.details);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/api/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<Session>("POST", "/api/auth/login", { username, password }),
  logout: () => request<void>("POST", "/api/auth/logout"),
  me: () => request<{ id: number; username: string; is_admin: boolean }>("GET", "/api/auth/me"),
  availability: (date: string) =>
    request<{ items: Slot[] }>("GET", `/api/availability?date=${encodeURIComponent(date)}`),
  myReservations: () => request<{ items: Reservation[]; total: number }>("GET", "/api/reservations"),
  createReservation: (input: ReservationInput) =>
    request<Reservation>("POST", "/api/reservations", input),
  updateReservation: (id: number, input: ReservationInput) =>
    request<Reservation>("PUT", `/api/reservations/${id}`, input),
  deleteReservation: (id: number) => request<void>("DELETE", `/api/reservations/${id}`),
  adminReservations: (date: string, page: number, pageSize: number) =>
    request<{ items: Reservation[]; total: number; page: number; page_size: number }>(
      "GET",
      `/api/admin/reservations?date=${encodeURIComponent(date)}&page=${page}&page_size=${pageSize}`,
    ),
};

export const SLOT_CAPACITY = 20;

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
