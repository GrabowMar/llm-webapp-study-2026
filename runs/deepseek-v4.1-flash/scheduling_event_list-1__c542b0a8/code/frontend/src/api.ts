import type { EventInput, EventItem, EventList } from "./types";

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const message =
      data && typeof data.error === "string" ? data.error : `Request failed (${response.status})`;
    const fields =
      data && typeof data.errors === "object" && data.errors !== null
        ? (data.errors as Record<string, string>)
        : {};
    throw new ApiError(response.status, message, fields);
  }
  return data as T;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function register(username: string, password: string): Promise<{ username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<{ token: string; username?: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listEvents(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<EventList> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  return request(`/api/events?${params.toString()}`, { signal });
}

export function createEvent(token: string, input: EventInput): Promise<EventItem> {
  return request("/api/events", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export function updateEvent(token: string, id: number, input: EventInput): Promise<EventItem> {
  return request(`/api/events/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export function deleteEvent(token: string, id: number): Promise<void> {
  return request(`/api/events/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}
