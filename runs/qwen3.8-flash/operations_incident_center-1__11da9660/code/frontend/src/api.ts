export type Severity = "sev1" | "sev2" | "sev3" | "sev4";
export type IncidentStatus =
  | "investigating"
  | "identified"
  | "mitigated"
  | "resolved";

export interface Incident {
  id: number;
  title: string;
  service: string;
  severity: Severity;
  status: IncidentStatus;
  commander: string;
  impact_summary: string;
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

export interface IncidentList {
  items: Incident[];
  total: number;
  page: number;
  page_size: number;
}

export interface TimelineList {
  items: TimelineEvent[];
}

export interface PublicStats {
  open_total: number;
  open_by_severity: Record<Severity, number>;
  sla_breached_open: number;
  resolved_last_30_days: number;
}

export class ApiError extends Error {
  status: number;
  details: Record<string, string> | null;

  constructor(status: number, message: string, details: Record<string, string> | null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const TOKEN_KEY = "ic_token";
const USER_KEY = "ic_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token && options.auth !== false) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-json body */
  }

  if (!res.ok) {
    const obj = (data ?? {}) as { error?: string; details?: Record<string, string> };
    if (res.status === 401 && getToken()) {
      window.dispatchEvent(new CustomEvent("ic:unauthorized"));
    }
    throw new ApiError(res.status, obj.error ?? `request failed (${res.status})`, obj.details ?? null);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/auth/register", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  listIncidents: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    const suffix = qs.toString();
    return request<IncidentList>(`/incidents${suffix ? `?${suffix}` : ""}`);
  },
  createIncident: (body: Record<string, string>) =>
    request<Incident>("/incidents", { method: "POST", body }),
  getIncident: (id: number | string) => request<Incident>(`/incidents/${id}`),
  patchIncident: (id: number | string, body: Record<string, string>) =>
    request<Incident>(`/incidents/${id}`, { method: "PATCH", body }),
  getTimeline: (id: number | string) =>
    request<TimelineList>(`/incidents/${id}/timeline`),
  postEvent: (id: number | string, message: string, type?: string) =>
    request<TimelineEvent>(`/incidents/${id}/timeline`, {
      method: "POST",
      body: type ? { message, type } : { message },
    }),
  stats: () => request<PublicStats>("/public/stats", { auth: false }),
};
