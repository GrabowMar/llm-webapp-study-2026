export type NoteSummary = {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
};

export type Note = NoteSummary & {
  body: string;
  author: string;
};

export type PublicNote = {
  id: number;
  title: string;
  author: string;
  updated_at: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "notes.token";
const USER_KEY = "notes.username";

export function getSession(): { token: string; username: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  return token && username ? { token, username } : null;
}

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  opts: { auth?: boolean; signal?: AbortSignal } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  const auth = opts.auth ?? true;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const session = getSession();
  if (auth && session) headers["Authorization"] = `Bearer ${session.token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      /* ignore */
    }
    if (res.status === 401 && auth && session && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(res.status, message);
  }
  return res;
}

async function json<T>(p: Promise<Response>): Promise<T> {
  return (await p).json() as Promise<T>;
}

export const api = {
  register: (username: string, password: string) =>
    request("POST", "/auth/register", { username, password }, { auth: false }),
  login: (username: string, password: string) =>
    json<{ token: string; username?: string }>(
      request("POST", "/auth/login", { username, password }, { auth: false }),
    ),
  logout: () => request("POST", "/auth/logout").catch(() => undefined),
  listNotes: () => json<{ items: NoteSummary[] }>(request("GET", "/notes")),
  createNote: (data: Partial<Pick<Note, "title" | "body" | "published">>) =>
    json<Note>(request("POST", "/notes", data)),
  getNote: (id: number) => json<Note>(request("GET", `/notes/${id}`)),
  updateNote: (id: number, data: Partial<Pick<Note, "title" | "body" | "published">>) =>
    json<Note>(request("PATCH", `/notes/${id}`, data)),
  deleteNote: (id: number) => request("DELETE", `/notes/${id}`),
  noteHtml: async (id: number, signal?: AbortSignal) =>
    (await request("GET", `/notes/${id}/html`, undefined, { signal })).text(),
  publicNote: (id: number) =>
    json<PublicNote>(request("GET", `/public/notes/${id}`, undefined, { auth: false })),
  publicNoteHtml: async (id: number) =>
    (await request("GET", `/public/notes/${id}/html`, undefined, { auth: false })).text(),
};

export function publicUrl(id: number) {
  return `${window.location.origin}/p/${id}`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
