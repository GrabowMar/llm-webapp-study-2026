const TOKEN_KEY = "incident_token";
const USER_KEY = "incident_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuth(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  return res;
}

export class ApiError extends Error {
  status: number;
  messages: string[];

  constructor(status: number, message: string, messages: string[]) {
    super(message);
    this.status = status;
    this.messages = messages;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let messages: string[] = [];
  try {
    const body = await res.json();
    if (body.error) message = body.error;
    if (Array.isArray(body.messages)) messages = body.messages;
  } catch {
    /* ignore */
  }
  return new ApiError(res.status, message, messages);
}

export async function register(username: string, password: string) {
  const res = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function login(username: string, password: string) {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function getStats(): Promise<Stats> {
  const res = await apiFetch("/api/public/stats");
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export interface IncidentFilters {
  severity?: string;
  status?: string;
  open?: boolean | null;
  q?: string;
  page?: number;
  page_size?: number;
}

export async function listIncidents(
  filters: IncidentFilters,
): Promise<IncidentListResponse> {
  const params = new URLSearchParams();
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.status) params.set("status", filters.status);
  if (filters.open !== null && filters.open !== undefined) {
    params.set("open", filters.open ? "1" : "0");
  }
  if (filters.q) params.set("q", filters.q);
  params.set("page", String(filters.page ?? 1));
  params.set("page_size", String(filters.page_size ?? 20));
  const res = await apiFetch(`/api/incidents?${params.toString()}`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function getIncident(id: string | number): Promise<Incident> {
  const res = await apiFetch(`/api/incidents/${id}`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export interface IncidentInput {
  title: string;
  service: string;
  severity: string;
  commander: string;
  impact_summary: string;
}

export async function createIncident(input: IncidentInput): Promise<Incident> {
  const res = await apiFetch("/api/incidents", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function updateIncident(
  id: string | number,
  patch: Partial<IncidentInput> & { status?: string },
): Promise<Incident> {
  const res = await apiFetch(`/api/incidents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function getTimeline(
  id: string | number,
): Promise<{ items: TimelineEvent[] }> {
  const res = await apiFetch(`/api/incidents/${id}/timeline`);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function postTimeline(
  id: string | number,
  message: string,
  type = "comment",
): Promise<TimelineEvent> {
  const res = await apiFetch(`/api/incidents/${id}/timeline`, {
    method: "POST",
    body: JSON.stringify({ message, type }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}
