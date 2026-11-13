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

export type Summary = {
  items: { project: string; hours: number }[];
  total_hours: number;
};

export type Filters = { start_date: string; end_date: string; project: string };

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;
  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "timesheet_token";
const USER_KEY = "timesheet_username";

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get username() {
    return localStorage.getItem(USER_KEY);
  },
  set(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function send(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (auth && session.token) headers.set("Authorization", `Bearer ${session.token}`);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    let errors: Record<string, string> = {};
    try {
      const body = await res.json();
      if (body.error) message = body.error;
      if (body.errors) errors = body.errors;
    } catch {
      /* ignore non-JSON bodies */
    }
    if (res.status === 401 && auth && session.token) onUnauthorized();
    throw new ApiError(res.status, message, errors);
  }
  return res;
}

async function json<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const res = await send(path, init, auth);
  if (res.status === 204) return undefined as T;
  return res.json();
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  register: (username: string, password: string) =>
    json<{ username: string }>(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false,
    ),
  login: (username: string, password: string) =>
    json<{ token: string }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false,
    ),
  logout: () => json<void>("/api/auth/logout", { method: "POST" }),
  entries: (f: Filters, page: number, pageSize: number) =>
    json<EntryPage>(`/api/entries${query({ ...f, page, page_size: pageSize })}`),
  summary: (f: Filters) => json<Summary>(`/api/summary${query({ ...f })}`),
  projects: () => json<{ items: string[] }>("/api/projects"),
  create: (body: Partial<Entry>) =>
    json<Entry>("/api/entries", { method: "POST", body: JSON.stringify(body) }),
  update: (id: number, body: Partial<Entry>) =>
    json<Entry>(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: number) => json<void>(`/api/entries/${id}`, { method: "DELETE" }),
  download: async (path: string, params: Record<string, string>, filename: string) => {
    const res = await send(`${path}${query(params)}`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
