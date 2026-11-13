export const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"] as const;
export const STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
export type Severity = (typeof SEVERITIES)[number];
export type Status = (typeof STATUSES)[number];

export interface Incident {
  id: number;
  title: string;
  service: string;
  severity: Severity;
  status: Status;
  commander: string | null;
  impact_summary: string | null;
  opened_at: string;
  resolved_at: string | null;
  reopen_count: number;
  opened_by: string;
  sla_due_at: string;
  sla_breached: boolean;
}

export interface TimelineEvent {
  id: number;
  type: string;
  message: string;
  created_at: string;
  author: string;
}

export interface IncidentPage {
  items: Incident[];
  total: number;
  page: number;
  page_size: number;
}

export interface PublicStats {
  open_total: number;
  open_by_severity: Record<Severity, number>;
  sla_breached_open: number;
  resolved_last_30_days: number;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "incident-center-token";
const USER_KEY = "incident-center-user";
const listeners = new Set<() => void>();

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(token: string | null, user: string | null) {
  if (token && user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, user);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  listeners.forEach((l) => l());
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
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
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    if (res.status === 401 && token && !path.startsWith("/auth/")) setSession(null, null);
    throw new ApiError(res.status, d.error ?? `Request failed (${res.status})`, d.fields ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  stats: () => request<PublicStats>("GET", "/public/stats"),
  incidents: (params: URLSearchParams) =>
    request<IncidentPage>("GET", `/incidents?${params.toString()}`),
  incident: (id: number) => request<Incident>("GET", `/incidents/${id}`),
  createIncident: (body: Record<string, unknown>) =>
    request<Incident>("POST", "/incidents", body),
  updateIncident: (id: number, body: Record<string, unknown>) =>
    request<Incident>("PATCH", `/incidents/${id}`, body),
  timeline: (id: number) =>
    request<{ items: TimelineEvent[] }>("GET", `/incidents/${id}/timeline`),
  postEvent: (id: number, message: string) =>
    request<TimelineEvent>("POST", `/incidents/${id}/timeline`, { message }),
};
