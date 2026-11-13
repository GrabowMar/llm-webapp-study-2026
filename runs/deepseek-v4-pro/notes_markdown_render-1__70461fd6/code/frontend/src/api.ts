export interface NoteItem {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
}

export interface Note extends NoteItem {
  body: string;
  author: string;
}

const TOKEN_KEY = "notes_token";
const USER_KEY = "notes_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) {
    return undefined as T;
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string }>("/api/auth/register", {
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

export function listNotes() {
  return request<{ items: NoteItem[] }>("/api/notes");
}

export function getNote(id: number) {
  return request<Note>(`/api/notes/${id}`);
}

export function createNote() {
  return request<Note>("/api/notes", {
    method: "POST",
    body: JSON.stringify({ title: "", body: "" }),
  });
}

export function updateNote(
  id: number,
  patch: Partial<Pick<Note, "title" | "body" | "published">>,
) {
  return request<Note>(`/api/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteNote(id: number) {
  return request<void>(`/api/notes/${id}`, { method: "DELETE" });
}

export async function renderNote(id: number): Promise<string> {
  return requestText(`/api/notes/${id}/html`);
}

export async function renderPublicNote(id: number): Promise<string> {
  return requestText(`/api/public/notes/${id}/html`);
}

export interface PublicNoteMeta {
  id: number;
  title: string;
  updated_at: string;
  author: string;
}

export async function getPublicNote(id: number): Promise<PublicNoteMeta> {
  return requestTextJson(`/api/public/notes/${id}`);
}

async function requestTextJson(path: string): Promise<PublicNoteMeta> {
  const text = await requestText(path);
  return JSON.parse(text);
}

async function requestText(path: string): Promise<string> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  return res.text();
}
