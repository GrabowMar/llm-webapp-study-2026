export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
  created_at: string;
  created_by: string;
}

export interface EventInput {
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "event-calendar-token";
const USERNAME_KEY = "event-calendar-username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function storeSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: { message?: string; errors?: Record<string, string> } = {};
  try {
    payload = await response.json();
  } catch {
    // response had no JSON body
  }
  return new ApiError(
    response.status,
    payload.message ?? `Request failed (${response.status}).`,
    payload.errors ?? {},
  );
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (authenticated && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function register(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchMe(): Promise<{ username: string }> {
  return request("/api/auth/me", {}, true);
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" }, true);
}

export async function fetchEvents(
  startDate?: string,
  endDate?: string,
): Promise<{ items: CalendarEvent[]; total: number }> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const query = params.toString();
  return request(`/api/events${query ? `?${query}` : ""}`);
}

export async function createEvent(input: EventInput): Promise<CalendarEvent> {
  return request(
    "/api/events",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export async function updateEvent(
  id: number,
  input: EventInput,
): Promise<CalendarEvent> {
  return request(
    `/api/events/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
    true,
  );
}

export async function deleteEvent(id: number): Promise<void> {
  return request(`/api/events/${id}`, { method: "DELETE" }, true);
}
