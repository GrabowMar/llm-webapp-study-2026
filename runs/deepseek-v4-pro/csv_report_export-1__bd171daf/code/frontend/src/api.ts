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

const TOKEN_KEY = "timesheet_token";
const USERNAME_KEY = "timesheet_username";

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

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const resp = await fetch(path, { ...options, headers });
  if (resp.status === 401) {
    clearSession();
  }
  return resp;
}

export async function apiError(resp: Response): Promise<string> {
  try {
    const data = await resp.json();
    if (data && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // ignore
  }
  return `Request failed (${resp.status})`;
}

export async function register(
  username: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (resp.ok) return { ok: true };
  return { ok: false, error: await apiError(resp) };
}

export async function login(
  username: string,
  password: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const resp = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (resp.ok) {
    const data = await resp.json();
    return { ok: true, token: data.token };
  }
  return { ok: false, error: await apiError(resp) };
}

export interface Filters {
  start_date?: string;
  end_date?: string;
  project?: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export async function fetchEntries(
  filters: Filters,
  page: number,
  pageSize: number,
): Promise<EntryPage> {
  const resp = await request(
    `/api/entries${buildQuery({
      start_date: filters.start_date,
      end_date: filters.end_date,
      project: filters.project,
      page,
      page_size: pageSize,
    })}`,
  );
  if (!resp.ok) throw new Error(await apiError(resp));
  return resp.json();
}

export async function createEntry(data: {
  project: string;
  description: string;
  hours: number;
  date: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resp = await request("/api/entries", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (resp.ok) return { ok: true };
  return { ok: false, error: await apiError(resp) };
}

export async function updateEntry(
  id: number,
  fields: Partial<{ project: string; description: string; hours: number; date: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const resp = await request(`/api/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  if (resp.ok) return { ok: true };
  return { ok: false, error: await apiError(resp) };
}

export async function deleteEntry(id: number): Promise<{ ok: boolean; error?: string }> {
  const resp = await request(`/api/entries/${id}`, { method: "DELETE" });
  if (resp.ok) return { ok: true };
  return { ok: false, error: await apiError(resp) };
}

export async function downloadCsv(kind: "entries" | "summary", filters: Filters) {
  const resp = await request(
    `/api/exports/${kind}.csv${buildQuery({
      start_date: filters.start_date,
      end_date: filters.end_date,
      project: filters.project,
    })}`,
  );
  if (!resp.ok) throw new Error(await apiError(resp));
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
