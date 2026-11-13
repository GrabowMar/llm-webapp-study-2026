import type { EntriesResponse, Entry, EntryFilters, EntryInput, Session, SummaryItem } from "./types";

const TOKEN_KEY = "timesheet.token";
const USERNAME_KEY = "timesheet.username";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

export function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  if (!token || !username) return null;
  return { token, username };
}

export function saveSession(session: Session): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USERNAME_KEY, session.username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler = () => {};

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

async function readError(response: Response): Promise<{ message: string; fields: Record<string, string> }> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      errors?: Record<string, string>;
    };
    return {
      message: payload.error || response.statusText || "Request failed.",
      fields: payload.errors ?? {},
    };
  } catch {
    return { message: response.statusText || "Request failed.", fields: {} };
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const session = loadSession();
  if (session) headers.set("Authorization", `Bearer ${session.token}`);

  const response = await fetch(`/api${path}`, { ...options, headers });

  if (!response.ok) {
    const { message, fields } = await readError(response);
    if (response.status === 401 && !path.startsWith("/auth/")) {
      clearSession();
      unauthorizedHandler();
    }
    throw new ApiError(response.status, message, fields);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function queryString(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === "" || value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function register(username: string, password: string): Promise<Session> {
  const data = await request<{ token: string; username: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return { token: data.token, username: data.username };
}

export async function login(username: string, password: string): Promise<Session> {
  const data = await request<{ token: string; username: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return { token: data.token, username: data.username };
}

export async function logout(): Promise<void> {
  await request<void>("/auth/logout", { method: "POST" });
}

export function listEntries(
  filters: EntryFilters,
  page: number,
  pageSize: number,
): Promise<EntriesResponse> {
  return request<EntriesResponse>(
    `/entries${queryString({ ...filters, page, page_size: pageSize })}`,
  );
}

export function createEntry(input: EntryInput): Promise<Entry> {
  return request<Entry>("/entries", {
    method: "POST",
    body: JSON.stringify({
      project: input.project,
      description: input.description,
      hours: input.hours,
      date: input.date,
    }),
  });
}

export function updateEntry(id: number, patch: Partial<EntryInput>): Promise<Entry> {
  return request<Entry>(`/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteEntry(id: number): Promise<void> {
  return request<void>(`/entries/${id}`, { method: "DELETE" });
}

export async function listProjects(): Promise<string[]> {
  const data = await request<{ projects: string[] }>("/projects");
  return data.projects;
}

export async function fetchSummary(filters: {
  start_date: string;
  end_date: string;
}): Promise<SummaryItem[]> {
  const data = await request<{ items: SummaryItem[] }>(`/summary${queryString(filters)}`);
  return data.items;
}

export async function downloadCsv(
  path: string,
  params: Record<string, string>,
  filename: string,
): Promise<void> {
  const headers = new Headers();
  const session = loadSession();
  if (session) headers.set("Authorization", `Bearer ${session.token}`);

  const response = await fetch(`/api${path}${queryString(params)}`, { headers });
  if (!response.ok) {
    const { message, fields } = await readError(response);
    throw new ApiError(response.status, message, fields);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
