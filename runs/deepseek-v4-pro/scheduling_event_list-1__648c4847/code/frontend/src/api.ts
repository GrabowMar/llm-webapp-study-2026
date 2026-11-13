export interface EventItem {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  created_by: string;
}

export interface EventList {
  items: EventItem[];
  total: number;
}

export interface EventInput {
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
}

const TOKEN_KEY = "calendar_token";
const USERNAME_KEY = "calendar_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(path, { ...options, headers });
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
    throw new ApiError(res.status, data);
  }
  return data as T;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function register(username: string, password: string) {
  return request<{ username: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string; username: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listEvents(params?: {
  start_date?: string;
  end_date?: string;
}) {
  const q = new URLSearchParams();
  if (params?.start_date) q.set("start_date", params.start_date);
  if (params?.end_date) q.set("end_date", params.end_date);
  const qs = q.toString();
  return request<EventList>(`/api/events${qs ? `?${qs}` : ""}`);
}

export function getEvent(id: number) {
  return request<EventItem>(`/api/events/${id}`);
}

export function createEvent(input: EventInput) {
  return request<EventItem>("/api/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEvent(id: number, input: EventInput) {
  return request<EventItem>(`/api/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteEvent(id: number) {
  return request<{ deleted: boolean }>(`/api/events/${id}`, {
    method: "DELETE",
  });
}

export function fieldErrors(body: unknown): Record<string, string> {
  if (body && typeof body === "object" && "errors" in body) {
    const errs = (body as { errors: unknown }).errors;
    if (errs && typeof errs === "object") {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(errs)) {
        out[k] = Array.isArray(v) ? v.join(", ") : String(v);
      }
      return out;
    }
  }
  return {};
}
