import type { CalendarEvent, EventDraft, EventList, Session } from "./types";

const TOKEN_KEY = "calendar.token";
const USERNAME_KEY = "calendar.username";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export function loadSession(): Session | null {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const username = window.localStorage.getItem(USERNAME_KEY);
    if (!token || !username) return null;
    return { token, username };
  } catch {
    return null;
  }
}

export function saveSession(token: string, username: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USERNAME_KEY, username);
  } catch {
    /* storage unavailable - the session simply lasts for this page view */
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const session = loadSession();
  if (session) headers.Authorization = `Bearer ${session.token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const data = payload as { error?: string; message?: string; errors?: Record<string, string> } | null;
    const message =
      data?.error || data?.message || `The request failed (status ${response.status}).`;
    throw new ApiError(response.status, message, data?.errors ?? {});
  }

  return payload as T;
}

function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  async register(username: string, password: string): Promise<Session> {
    const data = await request<{ token: string; username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    return { token: data.token, username: data.username };
  },

  async login(username: string, password: string): Promise<Session> {
    const data = await request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    return { token: data.token, username };
  },

  async me(): Promise<string> {
    const data = await request<{ username: string }>("/auth/me");
    return data.username;
  },

  listEvents(range: { start_date?: string; end_date?: string } = {}): Promise<EventList> {
    return request<EventList>(`/events${toQuery(range)}`);
  },

  getEvent(id: number): Promise<CalendarEvent> {
    return request<CalendarEvent>(`/events/${id}`);
  },

  createEvent(draft: EventDraft): Promise<CalendarEvent> {
    return request<CalendarEvent>("/events", {
      method: "POST",
      body: JSON.stringify(draft),
    });
  },

  updateEvent(id: number, draft: EventDraft): Promise<CalendarEvent> {
    return request<CalendarEvent>(`/events/${id}`, {
      method: "PUT",
      body: JSON.stringify(draft),
    });
  },

  deleteEvent(id: number): Promise<{ ok: boolean; id: number }> {
    return request<{ ok: boolean; id: number }>(`/events/${id}`, { method: "DELETE" });
  },
};
