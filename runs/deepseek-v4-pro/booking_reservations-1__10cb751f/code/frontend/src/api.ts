export interface Reservation {
  id: number;
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string | null;
  created_at: string;
}

export interface ReservationList {
  items: Reservation[];
  total: number;
}

export interface AvailabilityItem {
  time: string;
  booked: number;
  remaining: number;
}

export interface Availability {
  items: AvailabilityItem[];
}

export interface AdminList extends ReservationList {
  page: number;
  page_size: number;
}

const TOKEN_KEY = "reservation_token";
const USER_KEY = "reservation_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Network error", 0);
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>(
      "POST",
      "/api/auth/register",
      { username, password },
      false
    ),
  login: (username: string, password: string) =>
    request<{ token: string }>(
      "POST",
      "/api/auth/login",
      { username, password },
      false
    ),
  createReservation: (data: ReservationInput) =>
    request<Reservation>("POST", "/api/reservations", data),
  listReservations: (date?: string) =>
    request<ReservationList>(
      "GET",
      "/api/reservations" + (date ? `?date=${encodeURIComponent(date)}` : "")
    ),
  updateReservation: (id: number, data: ReservationInput) =>
    request<Reservation>("PUT", `/api/reservations/${id}`, data),
  deleteReservation: (id: number) =>
    request<void>("DELETE", `/api/reservations/${id}`),
  availability: (date: string) =>
    request<Availability>(
      "GET",
      "/api/availability?date=" + encodeURIComponent(date),
      undefined,
      false
    ),
  adminReservations: (date?: string, page = 1, pageSize = 50) =>
    request<AdminList>(
      "GET",
      "/api/admin/reservations" +
        `?date=${encodeURIComponent(date ?? "")}` +
        `&page=${page}&page_size=${pageSize}`
    ),
};

export interface ReservationInput {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes?: string | null;
}
