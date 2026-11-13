import type { CalendarEvent, EventPayload } from "./types";

const TOKEN_KEY = "calendar.token";
const USER_KEY = "calendar.username";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
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
    const body = data as { error?: string; message?: string } | null;
    const message =
      body?.error ?? body?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function register(username: string, password: string): Promise<{ username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data.token;
}

export function listEvents(
  startDate: string,
  endDate: string,
): Promise<{ items: CalendarEvent[]; total: number }> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  return request(`/api/events?${params.toString()}`);
}

export function getEvent(id: number): Promise<CalendarEvent> {
  return request(`/api/events/${id}`);
}

export function createEvent(payload: EventPayload): Promise<CalendarEvent> {
  return request("/api/events", { method: "POST", body: JSON.stringify(payload) });
}

export function updateEvent(id: number, payload: EventPayload): Promise<CalendarEvent> {
  return request(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteEvent(id: number): Promise<{ ok: boolean }> {
  return request(`/api/events/${id}`, { method: "DELETE" });
}
