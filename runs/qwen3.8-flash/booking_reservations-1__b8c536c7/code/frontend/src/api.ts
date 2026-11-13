import { useEffect, useState } from "react";

export type Reservation = {
  id: number;
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string;
  created_at: string;
};

export type Slot = { time: string; booked: number; remaining: number };

const TOKEN_KEY = "reservations.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export const SIGNED_OUT_EVENT = "reservations:signed-out";

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    }
    const message =
      (body && (body.message || body.error)) || `Request failed (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ message?: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  createReservation: (data: Partial<Reservation>) =>
    request<Reservation>("/reservations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listReservations: (date?: string) =>
    request<{ items: Reservation[]; total: number }>(
      `/reservations${date ? `?date=${encodeURIComponent(date)}` : ""}`
    ),
  updateReservation: (id: number, data: Partial<Reservation>) =>
    request<Reservation>(`/reservations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteReservation: (id: number) =>
    request<{ message: string }>(`/reservations/${id}`, { method: "DELETE" }),
  availability: (date: string) =>
    request<{ items: Slot[] }>(`/availability?date=${encodeURIComponent(date)}`),
  adminReservations: (date: string, page = 1, pageSize = 20) =>
    request<{ items: Reservation[]; total: number; page: number; page_size: number }>(
      `/admin/reservations?date=${encodeURIComponent(date)}&page=${page}&page_size=${pageSize}`
    ),
};

export function useSession() {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? localStorage.getItem("reservations.username") : null
  );
  useEffect(() => {
    const handler = () => setUsername(null);
    window.addEventListener(SIGNED_OUT_EVENT, handler);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, handler);
  }, []);
  const signIn = (user: string, token: string) => {
    setToken(token);
    localStorage.setItem("reservations.username", user);
    setUsername(user);
  };
  const signOut = () => {
    setToken(null);
    localStorage.removeItem("reservations.username");
    setUsername(null);
  };
  return { username, isAdmin: !!username && username === "admin", signIn, signOut };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
