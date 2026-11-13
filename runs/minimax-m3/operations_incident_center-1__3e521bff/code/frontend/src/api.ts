import type {
  Incident,
  IncidentListResponse,
  PublicStats,
  TimelineEvent,
  TimelineResponse,
} from "./types";

const TOKEN_KEY = "incident_center.token";
const USERNAME_KEY = "incident_center.username";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(message: string, status: number, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string, username: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USERNAME_KEY, username);
  } catch {
    /* storage unavailable */
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function getStoredUsername(): string | null {
  try {
    return window.localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("The server is unreachable", 0);
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(
      body.error ?? `Request failed with status ${response.status}`,
      response.status,
      body.errors ?? {},
    );
  }
  return payload as T;
}

export interface IncidentQuery {
  severity?: string;
  status?: string;
  open?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),

  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
    }),

  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    }),

  listIncidents: (query: IncidentQuery = {}) => {
    const params = new URLSearchParams();
    if (query.severity) params.set("severity", query.severity);
    if (query.status) params.set("status", query.status);
    if (query.open !== undefined) params.set("open", query.open ? "true" : "false");
    if (query.q) params.set("q", query.q);
    if (query.page) params.set("page", String(query.page));
    if (query.page_size) params.set("page_size", String(query.page_size));
    const suffix = params.toString();
    return request<IncidentListResponse>(`/api/incidents${suffix ? `?${suffix}` : ""}`);
  },

  createIncident: (payload: {
    title: string;
    service: string;
    severity: string;
    commander: string;
    impact_summary: string;
  }) => request<Incident>("/api/incidents", { method: "POST", body: payload }),

  getIncident: (id: number) => request<Incident>(`/api/incidents/${id}`),

  updateIncident: (id: number, patch: Partial<Incident>) =>
    request<Incident>(`/api/incidents/${id}`, { method: "PATCH", body: patch }),

  listTimeline: (id: number) =>
    request<TimelineResponse>(`/api/incidents/${id}/timeline`),

  postTimelineEvent: (id: number, message: string, type = "note") =>
    request<TimelineEvent>(`/api/incidents/${id}/timeline`, {
      method: "POST",
      body: { message, type },
    }),

  publicStats: () => request<PublicStats>("/api/public/stats"),
};
