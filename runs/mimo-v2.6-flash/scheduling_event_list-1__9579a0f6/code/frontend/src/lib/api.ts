export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  created_by: string;
}

export interface EventPayload {
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
}

export class ApiError extends Error {
  status: number;
  field?: string;

  constructor(message: string, status: number, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
  }
}

const TOKEN_KEY = "calendar_token";
const USERNAME_KEY = "calendar_username";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
}

export function storeSession(token: string, username: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
  } catch {
    /* storage unavailable */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && init.body !== null) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach the server", 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const record = body as { error?: unknown; field?: unknown } | null;
    const message =
      record && typeof record.error === "string"
        ? record.error
        : `Request failed (${response.status})`;
    const field =
      record && typeof record.field === "string" ? record.field : undefined;
    throw new ApiError(message, response.status, field);
  }

  return body as T;
}

export async function register(username: string, password: string): Promise<void> {
  await request("/api/auth/register", {
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

export async function listEvents(range?: {
  start: string;
  end: string;
}): Promise<{ items: CalendarEvent[]; total: number }> {
  const params = new URLSearchParams();
  if (range) {
    params.set("start_date", range.start);
    params.set("end_date", range.end);
  }
  const query = params.toString();
  return request(`/api/events${query ? `?${query}` : ""}`);
}

export async function createEvent(payload: EventPayload): Promise<CalendarEvent> {
  return request<CalendarEvent>("/api/events", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEvent(
  id: number,
  payload: EventPayload,
): Promise<CalendarEvent> {
  return request<CalendarEvent>(`/api/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteEvent(id: number): Promise<void> {
  await request<void>(`/api/events/${id}`, { method: "DELETE" });
}
