import type {
  AdminReservationList,
  AvailabilityList,
  Reservation,
  ReservationInput,
  ReservationList,
} from "./types";

const TOKEN_KEY = "token";
const USERNAME_KEY = "username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSavedUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (res.status === 401 && token) {
      clearSession();
      window.dispatchEvent(new Event("auth:signout"));
    }
    const body = data as { error?: string; message?: string } | null;
    const message =
      body?.error || body?.message || `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function register(username: string, password: string) {
  return post<{ username: string }>("/api/auth/register", { username, password });
}

export function login(username: string, password: string) {
  return post<{ token: string }>("/api/auth/login", { username, password });
}

export function createReservation(input: ReservationInput) {
  return post<Reservation>("/api/reservations", input);
}

export function listReservations(date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return api<ReservationList>(`/api/reservations${query}`);
}

export function updateReservation(id: number, input: ReservationInput) {
  return api<Reservation>(`/api/reservations/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteReservation(id: number) {
  return api<{ ok: boolean }>(`/api/reservations/${id}`, { method: "DELETE" });
}

export function fetchAvailability(date: string) {
  return api<AvailabilityList>(
    `/api/availability?date=${encodeURIComponent(date)}`,
  );
}

export function fetchAdminReservations(params: {
  date?: string;
  page?: number;
  page_size?: number;
}) {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.page_size !== undefined) {
    query.set("page_size", String(params.page_size));
  }
  const qs = query.toString();
  return api<AdminReservationList>(
    `/api/admin/reservations${qs ? `?${qs}` : ""}`,
  );
}
