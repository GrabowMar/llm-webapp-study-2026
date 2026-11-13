export type Note = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
  author: string;
};

export type NotePage = {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
};

export type TagCount = { tag: string; count: number };

export type NoteInput = {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
};

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "notes.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const obj = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, obj.error || `Request failed (${res.status})`, obj.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string; token?: string }>("POST", "/auth/register", {
      username,
      password,
    }),
  login: (username: string, password: string) =>
    request<{ token: string; username?: string }>("POST", "/auth/login", { username, password }),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),
  listNotes: (params: { q?: string; author?: string; tag?: string; page?: number; page_size?: number }) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") qs.set(key, String(value));
    }
    const s = qs.toString();
    return request<NotePage>("GET", `/notes${s ? `?${s}` : ""}`);
  },
  getNote: (id: number) => request<Note>("GET", `/notes/${id}`),
  createNote: (input: NoteInput) => request<Note>("POST", "/notes", input),
  updateNote: (id: number, input: Partial<NoteInput>) => request<Note>("PATCH", `/notes/${id}`, input),
  deleteNote: (id: number) => request<void>("DELETE", `/notes/${id}`),
  tags: () => request<{ items: TagCount[] }>("GET", "/tags"),
};
