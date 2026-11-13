import type { Note, NoteSummary } from "./types";

const TOKEN_KEY = "mdnotes.token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  accept?: string;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (res.status === 401 && token) {
    setToken(null);
    onUnauthorized?.();
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if ((opts.accept ?? "json") === "html") return text as unknown as T;
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ username: string }>("/api/auth/me"),

  listNotes: () => request<{ items: NoteSummary[] }>("/api/notes"),
  getNote: (id: number) => request<Note>(`/api/notes/${id}`),
  createNote: (body: { title?: string; body?: string }) =>
    request<Note>("/api/notes", { method: "POST", body }),
  updateNote: (
    id: number,
    patch: { title?: string; body?: string; published?: boolean },
  ) => request<Note>(`/api/notes/${id}`, { method: "PATCH", body: patch }),
  deleteNote: (id: number) => request<void>(`/api/notes/${id}`, { method: "DELETE" }),

  renderHtml: (body: string) =>
    request<string>("/api/render", { method: "POST", body: { body }, accept: "html" }),
  noteHtml: (id: number) =>
    request<string>(`/api/notes/${id}/html`, { accept: "html" }),
  publicNote: (id: number) => request<NoteSummary>(`/api/public/notes/${id}`),
  publicNoteHtml: (id: number) =>
    request<string>(`/api/public/notes/${id}/html`, { accept: "html" }),
};

export function publicUrl(id: number): string {
  return `${window.location.origin}/public/${id}`;
}
