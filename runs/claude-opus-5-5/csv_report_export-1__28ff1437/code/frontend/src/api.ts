export type Entry = {
  id: number;
  project: string;
  description: string;
  hours: number;
  date: string;
  created_at: string;
};

export type EntryPage = {
  items: Entry[];
  total: number;
  page: number;
  page_size: number;
};

export type ProjectTotal = { project: string; hours: number };

export type Summary = { items: ProjectTotal[]; total_hours: number };

export type EntryInput = {
  project?: string;
  description?: string;
  hours?: number | string | null;
  date?: string;
};

export type Filters = {
  start_date: string;
  end_date: string;
  project: string;
};

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const TOKEN_KEY = "timesheet.token";
const USER_KEY = "timesheet.username";

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function getSession(): { token: string; username: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  return token && username ? { token, username } : null;
}

function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function toError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let fieldErrors: Record<string, string> = {};
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") message = body.error;
    if (body && body.errors && typeof body.errors === "object") fieldErrors = body.errors;
  } catch {
    // non-JSON error body
  }
  return new ApiError(res.status, message, fieldErrors);
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = auth ? authHeaders() : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }
  if (!res.ok) {
    const err = await toError(res);
    if (auth && res.status === 401) unauthorizedHandler?.();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function register(username: string, password: string) {
  await request("POST", "/api/auth/register", { username, password }, false);
}

export async function login(username: string, password: string): Promise<string> {
  const res = await request<{ token: string; username?: string }>(
    "POST",
    "/api/auth/login",
    { username, password },
    false,
  );
  const name = res.username ?? username.trim();
  saveSession(res.token, name);
  return name;
}

export async function logout() {
  try {
    await request("POST", "/api/auth/logout", undefined, true);
  } catch {
    // ignore
  }
  clearSession();
}

export function listEntries(filters: Filters, page: number, pageSize: number) {
  return request<EntryPage>(
    "GET",
    `/api/entries${query({ ...filters, page, page_size: pageSize })}`,
  );
}

export function createEntry(input: EntryInput) {
  return request<Entry>("POST", "/api/entries", input);
}

export function updateEntry(id: number, input: EntryInput) {
  return request<Entry>("PATCH", `/api/entries/${id}`, input);
}

export function deleteEntry(id: number) {
  return request<void>("DELETE", `/api/entries/${id}`);
}

export function getSummary(filters: Filters) {
  return request<Summary>("GET", `/api/summary${query({ ...filters })}`);
}

export async function listProjects(): Promise<string[]> {
  const res = await request<{ items: string[] }>("GET", "/api/projects");
  return res.items;
}

export async function downloadCsv(kind: "entries" | "summary", filters: Filters) {
  const params =
    kind === "entries"
      ? { ...filters }
      : { start_date: filters.start_date, end_date: filters.end_date };
  let res: Response;
  try {
    res = await fetch(`/api/exports/${kind}.csv${query(params)}`, { headers: authHeaders() });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }
  if (!res.ok) {
    const err = await toError(res);
    if (res.status === 401) unauthorizedHandler?.();
    throw err;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match ? match[1] : `${kind}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function hoursPayload(raw: string): number | string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : trimmed;
}

export function todayIso(): string {
  const d = new Date();
  return toIso(d);
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatHours(h: number): string {
  return String(Math.round(h * 100) / 100);
}
