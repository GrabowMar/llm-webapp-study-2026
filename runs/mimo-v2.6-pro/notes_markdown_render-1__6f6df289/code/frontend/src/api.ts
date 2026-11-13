import type { Note, NoteSummary, PublicNote } from "./types";

const TOKEN_KEY = "markdown-notes-token";
const USERNAME_KEY = "markdown-notes-username";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function storeSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed with status ${res.status}`;
  try {
    const data = await res.json();
    if (data && typeof data.error === "string") message = data.error;
  } catch {
    if (res.status === 401) message = "authentication required";
  }
  return new ApiError(message, res.status);
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw await parseError(res);
  return res;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await request(path, init);
  return (await res.json()) as T;
}

function jsonBody(data: unknown): RequestInit {
  return { body: JSON.stringify(data) };
}

export async function register(username: string, password: string): Promise<void> {
  await requestJson("/api/auth/register", {
    method: "POST",
    ...jsonBody({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<{ token: string }> {
  return requestJson("/api/auth/login", {
    method: "POST",
    ...jsonBody({ username, password }),
  });
}

export async function listNotes(): Promise<NoteSummary[]> {
  const data = await requestJson<{ items: NoteSummary[] }>("/api/notes");
  return data.items;
}

export async function createNote(): Promise<Note> {
  return requestJson<Note>("/api/notes", { method: "POST", ...jsonBody({}) });
}

export async function getNote(id: number): Promise<Note> {
  return requestJson<Note>(`/api/notes/${id}`);
}

export interface NotePatch {
  title?: string;
  body?: string;
  published?: boolean;
}

export async function updateNote(id: number, patch: NotePatch): Promise<Note> {
  return requestJson<Note>(`/api/notes/${id}`, {
    method: "PATCH",
    ...jsonBody(patch),
  });
}

export async function deleteNote(id: number): Promise<void> {
  await request(`/api/notes/${id}`, { method: "DELETE" });
}

export async function fetchNoteHtml(id: number): Promise<string> {
  const res = await request(`/api/notes/${id}/html`);
  return res.text();
}

export async function fetchPublicNote(id: number): Promise<PublicNote> {
  return requestJson<PublicNote>(`/api/public/notes/${id}`);
}

export async function fetchPublicNoteHtml(id: number): Promise<string> {
  const res = await request(`/api/public/notes/${id}/html`);
  return res.text();
}
