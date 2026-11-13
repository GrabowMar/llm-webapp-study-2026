export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
}

export interface EventInput {
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
}

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  status: number;
  fieldErrors: FieldErrors;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const TOKEN_KEY = "calendar.token";
const USER_KEY = "calendar.username";

export function loadSession(): { token: string; username: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  return token && username ? { token, username } : null;
}

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = localStorage.getItem(TOKEN_KEY);
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const obj = (data ?? {}) as { error?: string; errors?: FieldErrors };
    if (res.status === 401 && auth && token && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(res.status, obj.error || `Request failed (${res.status})`, obj.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }, false),
  login: (username: string, password: string) =>
    request<{ token: string; username?: string }>("POST", "/auth/login", { username, password }, false),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  listEvents: (startDate: string, endDate: string) =>
    request<{ items: CalendarEvent[]; total: number }>(
      "GET",
      `/events?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
      undefined,
      false,
    ),
  getEvent: (id: number) => request<CalendarEvent>("GET", `/events/${id}`, undefined, false),
  createEvent: (input: EventInput) => request<CalendarEvent>("POST", "/events", input),
  updateEvent: (id: number, input: EventInput) => request<CalendarEvent>("PUT", `/events/${id}`, input),
  deleteEvent: (id: number) => request<void>("DELETE", `/events/${id}`),
};
