import type { Entry, EntryInput, EntryPage, Filters, Summary } from "./types";

const TOKEN_KEY = "timesheet.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Please try again.");
  }
  if (response.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }
  if (!response.ok) {
    const record = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(
      response.status,
      record.error ?? record.message ?? `Request failed (${response.status})`
    );
  }
  return data as T;
}

function filterQuery(filters: Filters): string {
  const params = new URLSearchParams();
  for (const key of ["start_date", "end_date", "project"] as const) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  username: () => request<{ username: string }>("/me"),
  listEntries: (filters: Filters, page: number, pageSize: number) => {
    const params = new URLSearchParams(filterQuery(filters).slice(1));
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    return request<EntryPage>(`/entries?${params}`);
  },
  createEntry: (input: EntryInput) =>
    request<Entry>("/entries", { method: "POST", body: JSON.stringify(input) }),
  updateEntry: (id: number, patch: Partial<EntryInput>) =>
    request<Entry>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteEntry: (id: number) =>
    request<void>(`/entries/${id}`, { method: "DELETE" }),
  summary: (filters: Filters) => request<Summary>(`/summary${filterQuery(filters)}`),
  projects: () => request<{ projects: string[] }>("/projects"),
};

export function exportUrl(kind: "entries" | "summary", filters: Filters): string {
  return `/api/exports/${kind}.csv${filterQuery(filters)}`;
}

export async function downloadCsv(kind: "entries" | "summary", filters: Filters): Promise<void> {
  const token = getToken();
  const response = await fetch(exportUrl(kind, filters), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, "Export failed.");
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] ?? `${kind}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
