export type Entry = {
  id: number;
  project: string;
  description: string;
  hours: number;
  date: string;
  created_at: string;
};

export type EntriesPage = {
  items: Entry[];
  total: number;
  page: number;
  page_size: number;
};

export type ProjectTotal = {
  project: string;
  hours: number;
};

export type Filters = {
  start_date: string;
  end_date: string;
  project: string;
};

export type EntryDraft = {
  project: string;
  description: string;
  hours: number | string;
  date: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "timesheet.token";
const USERNAME_KEY = "timesheet.username";

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

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as { error?: unknown; errors?: unknown };
    if (typeof record.error === "string" && record.error) {
      return record.error;
    }
    if (Array.isArray(record.errors)) {
      return record.errors.join(", ");
    }
    if (record.errors && typeof record.errors === "object") {
      const messages = Object.values(record.errors as Record<string, unknown>).filter(
        (value): value is string => typeof value === "string",
      );
      if (messages.length > 0) {
        return messages.join(", ");
      }
    }
  }
  return `Request failed (${status})`;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(path, { ...init, headers });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(messageFrom(body, response.status), response.status);
  }
  return body as T;
}

function filterParams(filters: Partial<Filters>): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.start_date) {
    params.set("start_date", filters.start_date);
  }
  if (filters.end_date) {
    params.set("end_date", filters.end_date);
  }
  if (filters.project) {
    params.set("project", filters.project);
  }
  return params;
}

export function filterQuery(filters: Partial<Filters>): string {
  const query = filterParams(filters).toString();
  return query ? `?${query}` : "";
}

export async function registerUser(username: string, password: string): Promise<void> {
  await apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function loginUser(username: string, password: string): Promise<string> {
  const data = await apiRequest<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data.token;
}

export async function fetchEntries(
  filters: Filters,
  page: number,
  pageSize: number,
): Promise<EntriesPage> {
  const params = filterParams(filters);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return apiRequest<EntriesPage>(`/api/entries?${params.toString()}`);
}

export async function fetchProjects(): Promise<string[]> {
  const data = await apiRequest<{ items: string[] }>("/api/projects");
  return data.items;
}

export async function fetchTotals(filters: Filters): Promise<ProjectTotal[]> {
  const data = await apiRequest<{ items: ProjectTotal[] }>(
    `/api/totals${filterQuery(filters)}`,
  );
  return data.items;
}

export async function createEntry(draft: EntryDraft): Promise<Entry> {
  return apiRequest<Entry>("/api/entries", {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

export async function updateEntry(
  id: number,
  changes: Partial<EntryDraft>,
): Promise<Entry> {
  return apiRequest<Entry>(`/api/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function deleteEntry(id: number): Promise<void> {
  await apiRequest(`/api/entries/${id}`, { method: "DELETE" });
}

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(path, { headers });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(messageFrom(body, response.status), response.status);
  }
  const blob = await response.blob();
  let filename = fallbackName;
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  if (match) {
    filename = match[1];
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
