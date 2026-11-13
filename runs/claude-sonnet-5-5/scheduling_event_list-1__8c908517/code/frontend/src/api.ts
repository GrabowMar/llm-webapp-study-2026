import type { CalEvent, EventInput } from "./types";

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;
  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

let token: string | null = null;
let onUnauthorized: () => void = () => {};

export function setToken(t: string | null) {
  token = t;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error, please try again");
  }
  if (res.status === 204) return undefined as T;
  let data: { error?: string; errors?: Record<string, string> } | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.errors ?? {});
  }
  return data as T;
}

export const register = (username: string, password: string) =>
  request<{ id: number; username: string }>("POST", "/auth/register", { username, password });

export const login = (username: string, password: string) =>
  request<{ token: string; username: string }>("POST", "/auth/login", { username, password });

export const logout = () => request<void>("POST", "/auth/logout");

export const me = () => request<{ username: string }>("GET", "/auth/me");

export const listEvents = (startIso: string, endIso: string) =>
  request<{ items: CalEvent[]; total: number }>(
    "GET",
    `/events?start_date=${encodeURIComponent(startIso)}&end_date=${encodeURIComponent(endIso)}`,
  );

export const createEvent = (e: EventInput) => request<CalEvent>("POST", "/events", e);

export const updateEvent = (id: number, e: EventInput) => request<CalEvent>("PUT", `/events/${id}`, e);

export const deleteEvent = (id: number) => request<void>("DELETE", `/events/${id}`);
