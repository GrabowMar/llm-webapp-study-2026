export interface Entry {
  id: number;
  project: string;
  description: string;
  hours: number;
  date: string;
  created_at: string;
}

export interface EntryPage {
  items: Entry[];
  total: number;
  page: number;
  page_size: number;
}

export interface EntryInput {
  project: string;
  description: string;
  hours: number | string;
  date: string;
}

export interface Filters {
  start_date: string;
  end_date: string;
  project: string;
}

const TOKEN_KEY = "timesheet.token";
const USER_KEY = "timesheet.username";

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getSavedUsername(): string | null {
  return window.localStorage.getItem(USER_KEY);
}

export function saveSession(token: string, username: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (data && typeof (data.error ?? data.message) === "string") {
      message = data.error ?? data.message;
    }
  } catch {
    // keep the generic message
  }
  return new ApiError(message, res.status);
}

function authHeaders(): Headers {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function register(
  username: string,
  password: string,
): Promise<{ username: string; token: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listEntries(
  params: Partial<Filters> & { page?: number; page_size?: number },
): Promise<EntryPage> {
  return request(`/api/entries${buildQuery(params)}`);
}

export function createEntry(input: EntryInput): Promise<Entry> {
  return request("/api/entries", { method: "POST", body: JSON.stringify(input) });
}

export function updateEntry(id: number, input: Partial<EntryInput>): Promise<Entry> {
  return request(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteEntry(id: number): Promise<void> {
  return request(`/api/entries/${id}`, { method: "DELETE" });
}

export async function downloadCsv(
  path: string,
  params: Record<string, string | number | undefined>,
  filename: string,
): Promise<void> {
  const res = await fetch(`${path}${buildQuery(params)}`, { headers: authHeaders() });
  if (!res.ok) throw await toApiError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
