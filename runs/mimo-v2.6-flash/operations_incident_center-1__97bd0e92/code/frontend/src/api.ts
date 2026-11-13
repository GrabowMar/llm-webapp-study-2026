export type Severity = "sev1" | "sev2" | "sev3" | "sev4";
export type Status =
  | "investigating"
  | "identified"
  | "mitigating"
  | "monitoring"
  | "resolved";

export interface Incident {
  id: number;
  title: string;
  service: string;
  severity: Severity;
  status: Status;
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
  errors: Record<string, string>;

  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors ?? {};
  }
}

const TOKEN_KEY = "incident_center_token";
const USERNAME_KEY = "incident_center_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const body = payload as
      | { error?: string; message?: string; errors?: Record<string, string> }
      | null;
    const message =
      body?.error ?? body?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, body?.errors);
  }
  return payload as T;
}
