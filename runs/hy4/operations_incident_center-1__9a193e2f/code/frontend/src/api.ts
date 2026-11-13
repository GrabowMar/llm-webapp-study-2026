import type { AuthResult, Incident, IncidentPage, Stats, TimelineEvent, TimelinePage } from "./types";

export const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;
export const STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;

const TOKEN_KEY = "incident-center-token";
const USERNAME_KEY = "incident-center-username";

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

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  let data: unknown = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const body = (data || {}) as { message?: string; error?: string; errors?: Record<string, string> };
    throw new ApiError(
      response.status,
      body.message || body.error || `Request failed (${response.status})`,
      body.errors || {},
    );
  }
  return data as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export const api = {
  register(username: string, password: string) {
    return request<AuthResult>("/api/auth/register", json("POST", { username, password }));
  },
  login(username: string, password: string) {
    return request<AuthResult>("/api/auth/login", json("POST", { username, password }));
  },
  me() {
    return request<{ username: string }>("/api/auth/me");
  },
  getStats() {
    return request<Stats>("/api/public/stats");
  },
  listIncidents(params: {
    severity?: string;
    status?: string;
    open?: boolean;
    q?: string;
    page: number;
    page_size: number;
  }) {
    const query = new URLSearchParams();
    if (params.severity) query.set("severity", params.severity);
    if (params.status) query.set("status", params.status);
    if (params.open) query.set("open", "true");
    if (params.q) query.set("q", params.q);
    query.set("page", String(params.page));
    query.set("page_size", String(params.page_size));
    return request<IncidentPage>(`/api/incidents?${query.toString()}`);
  },
  getIncident(id: number) {
    return request<Incident>(`/api/incidents/${id}`);
  },
  createIncident(body: {
    title: string;
    service: string;
    severity: string;
    commander: string;
    impact_summary: string;
  }) {
    return request<Incident>("/api/incidents", json("POST", body));
  },
  patchIncident(id: number, body: Record<string, unknown>) {
    return request<Incident>(`/api/incidents/${id}`, json("PATCH", body));
  },
  getTimeline(id: number) {
    return request<TimelinePage>(`/api/incidents/${id}/timeline`);
  },
  postTimeline(id: number, body: { message: string; type?: string }) {
    return request<TimelineEvent>(`/api/incidents/${id}/timeline`, json("POST", body));
  },
};

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function severityLabel(severity: string): string {
  return `SEV ${severity.replace("sev", "")}`;
}

export function severityBadge(severity: string): string {
  switch (severity) {
    case "sev1":
      return "bg-red-100 text-red-800 ring-red-200";
    case "sev2":
      return "bg-orange-100 text-orange-800 ring-orange-200";
    case "sev3":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "sev4":
      return "bg-sky-100 text-sky-800 ring-sky-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function statusBadge(status: string): string {
  switch (status.toLowerCase()) {
    case "resolved":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "monitoring":
      return "bg-blue-100 text-blue-800 ring-blue-200";
    case "identified":
      return "bg-violet-100 text-violet-800 ring-violet-200";
    case "investigating":
      return "bg-yellow-100 text-yellow-800 ring-yellow-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}
