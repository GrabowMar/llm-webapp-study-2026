export interface Event {
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
  items: Event[];
  total: number;
}

export interface EventInput {
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "eventcal.token";
const USER_KEY = "eventcal.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(token: string | null, username: string | null) {
  if (token && username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (options.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const body = (data ?? {}) as Record<string, unknown>;
    const message =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : `Request failed (${res.status})`;
    const fields =
      body.fields && typeof body.fields === "object"
        ? (body.fields as Record<string, string>)
        : {};
    throw new ApiError(res.status, message, fields);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ message: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; username?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  listEvents: (startDate: string, endDate: string) =>
    request<EventList>(
      `/api/events?start_date=${startDate}&end_date=${endDate}`,
    ),
  getEvent: (id: number) => request<Event>(`/api/events/${id}`),
  createEvent: (input: EventInput) =>
    request<Event>("/api/events", { method: "POST", body: JSON.stringify(input) }),
  updateEvent: (id: number, input: EventInput) =>
    request<Event>(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteEvent: (id: number) =>
    request<{ deleted: number }>(`/api/events/${id}`, { method: "DELETE" }),
};
