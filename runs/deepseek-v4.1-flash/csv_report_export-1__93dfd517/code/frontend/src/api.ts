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

export type ProjectTotal = {
  project: string;
  hours: number;
  count: number;
};

export type Filters = {
  start_date: string;
  end_date: string;
  project: string;
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(
    message: string,
    status: number,
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "timesheet_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get("Content-Type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text();
  if (!response.ok) {
    if (response.status === 401 && getToken()) {
      setToken(null);
    }
    const payload = (typeof data === "object" && data) || {};
    throw new ApiError(
      payload.error || "Something went wrong",
      response.status,
      payload.fields || {},
    );
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request<{ username: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return request<{ status: string }>("/api/auth/logout", { method: "POST" });
}

export function me() {
  return request<{ username: string }>("/api/auth/me");
}

function filterQuery(filters: Filters, includeProject = true): string {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (includeProject && filters.project) params.set("project", filters.project);
  return params.toString();
}

export function listEntries(
  filters: Filters,
  page: number,
  pageSize: number,
) {
  const params = new URLSearchParams(filterQuery(filters));
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return request<EntryPage>(`/api/entries?${params.toString()}`);
}

export function listProjects(filters: Filters) {
  return request<{ items: ProjectTotal[] }>(
    `/api/projects?${filterQuery(filters, false)}`,
  );
}

export type EntryInput = {
  project: string;
  description: string;
  hours: number | string;
  date: string;
};

export function createEntry(input: EntryInput) {
  return request<Entry>("/api/entries", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEntry(id: number, input: Partial<EntryInput>) {
  return request<Entry>(`/api/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteEntry(id: number) {
  return request<{ status: string }>(`/api/entries/${id}`, {
    method: "DELETE",
  });
}

export async function downloadCsv(path: string, filename: string) {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { headers });
  if (!response.ok) {
    throw new ApiError("Export failed", response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function entriesCsvUrl(filters: Filters) {
  return `/api/exports/entries.csv?${filterQuery(filters)}`;
}

export function summaryCsvUrl(filters: Filters) {
  return `/api/exports/summary.csv?${filterQuery(filters, false)}`;
}

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}
