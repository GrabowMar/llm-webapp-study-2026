export type Note = {
  id: number;
  title: string;
  body: string;
  published: boolean;
  updated_at: string;
  author: string;
};

export type NoteListItem = {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
};

export type PublicNote = {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
  author: string;
};

const TOKEN_KEY = "mdnotes.token";
const USERNAME_KEY = "mdnotes.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`;
  try {
    const data = await response.json();
    if (data && typeof data.error === "string") message = data.error;
  } catch {
    /* keep default */
  }
  throw new ApiError(response.status, message);
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function requestHtml(
  path: string,
  options: RequestOptions = {},
): Promise<string> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) await parseError(response);
  return await response.text();
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST", auth: true }),
  listNotes: () =>
    request<{ items: NoteListItem[] }>("/api/notes", { auth: true }),
  createNote: (data: { title: string; body: string; published: boolean }) =>
    request<Note>("/api/notes", { method: "POST", body: data, auth: true }),
  getNote: (id: number) =>
    request<Note>(`/api/notes/${id}`, { auth: true }),
  updateNote: (
    id: number,
    data: Partial<Pick<Note, "title" | "body" | "published">>,
  ) =>
    request<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: data,
      auth: true,
    }),
  deleteNote: (id: number) =>
    request<void>(`/api/notes/${id}`, { method: "DELETE", auth: true }),
  renderMarkdown: (body: string) =>
    requestHtml("/api/render", { method: "POST", body: { body } }),
  publicNoteHtml: (id: number) =>
    requestHtml(`/api/public/notes/${id}/html`),
  publicNote: (id: number) =>
    request<PublicNote>(`/api/public/notes/${id}`),
};
