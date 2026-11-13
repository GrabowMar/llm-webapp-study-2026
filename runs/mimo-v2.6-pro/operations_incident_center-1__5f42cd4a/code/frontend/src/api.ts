import type {
  Incident,
  IncidentPage,
  IncidentUpdate,
  NewIncident,
  PublicStats,
  TimelineEvent,
} from "./types";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "incident_center.token";
const USERNAME_KEY = "incident_center.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(path, { ...init, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const payload = (body ?? {}) as { error?: string; errors?: Record<string, string> };
    if (res.status === 401 && token) {
      clearSession();
      window.location.assign("/login");
    }
    throw new ApiError(
      res.status,
      payload.error ?? `Request failed with status ${res.status}`,
      payload.errors ?? {},
    );
  }
  return body as T;
}

export interface ListParams {
  severity?: string;
  status?: string;
  open?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
}

export const api = {
  register(username: string, password: string) {
    return request<{ username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  login(username: string, password: string) {
    return request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  listIncidents(params: ListParams = {}) {
    const qs = new URLSearchParams();
    if (params.severity) qs.set("severity", params.severity);
    if (params.status) qs.set("status", params.status);
    if (params.open !== undefined) qs.set("open", String(params.open));
    if (params.q) qs.set("q", params.q);
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.page_size !== undefined) qs.set("page_size", String(params.page_size));
    const suffix = qs.toString();
    return request<IncidentPage>(`/api/incidents${suffix ? `?${suffix}` : ""}`);
  },

  getIncident(id: number) {
    return request<Incident>(`/api/incidents/${id}`);
  },

  createIncident(data: NewIncident) {
    return request<Incident>("/api/incidents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateIncident(id: number, data: IncidentUpdate) {
    return request<Incident>(`/api/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  getTimeline(id: number) {
    return request<{ items: TimelineEvent[] }>(`/api/incidents/${id}/timeline`);
  },

  postTimelineEvent(id: number, data: { message: string; type?: string }) {
    return request<TimelineEvent>(`/api/incidents/${id}/timeline`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getPublicStats() {
    return request<PublicStats>("/api/public/stats");
  },
};
