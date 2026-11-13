const TOKEN_KEY = "incident_center_token";
const USER_KEY = "incident_center_user";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function storeSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });
  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const data = (payload ?? {}) as {
      error?: string;
      message?: string;
      errors?: Record<string, string>;
    };
    throw new ApiError(
      data.error ?? data.message ?? `Request failed (${response.status})`,
      response.status,
      data.errors ?? {},
    );
  }
  return payload as T;
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function fetchStats() {
  return request<import("./types").PublicStats>("/api/public/stats");
}

export function fetchIncidents(params: Record<string, string>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "") query.set(key, value);
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<import("./types").IncidentList>(`/api/incidents${suffix}`);
}

export function fetchIncident(id: string | number) {
  return request<import("./types").Incident>(`/api/incidents/${id}`);
}

export function createIncident(body: Record<string, unknown>) {
  return request<import("./types").Incident>("/api/incidents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateIncident(id: string | number, body: Record<string, unknown>) {
  return request<import("./types").Incident>(`/api/incidents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchTimeline(id: string | number) {
  return request<{ items: import("./types").TimelineEvent[] }>(
    `/api/incidents/${id}/timeline`,
  );
}

export function postTimelineEvent(
  id: string | number,
  type: string,
  message: string,
) {
  return request<import("./types").TimelineEvent>(
    `/api/incidents/${id}/timeline`,
    {
      method: "POST",
      body: JSON.stringify({ type, message }),
    },
  );
}
