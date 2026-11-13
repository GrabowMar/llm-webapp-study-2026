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

export type NoteList = {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
};

export type TagCount = { tag: string; count: number };

export type AuthorCount = { author: string; count: number };

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "notes.token";
const USER_KEY = "notes.username";

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return window.localStorage.getItem(USER_KEY);
}

export function storeSession(token: string, username: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = false } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "") ||
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : "") ||
      `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

export type Credentials = { username: string; password: string };

export type AuthResponse = { token: string; user: { id: number; username: string } };

export function register(credentials: Credentials): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", { method: "POST", body: credentials });
}

export function login(credentials: Credentials): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", { method: "POST", body: credentials });
}

export type NoteQuery = {
  tag?: string;
  author?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export function listNotes(query: NoteQuery = {}): Promise<NoteList> {
  const params = new URLSearchParams();
  if (query.tag) params.set("tag", query.tag);
  if (query.author) params.set("author", query.author);
  if (query.q) params.set("q", query.q);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize) params.set("page_size", String(query.pageSize));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<NoteList>(`/notes${suffix}`);
}

export function getNote(id: number): Promise<Note> {
  return request<Note>(`/notes/${id}`);
}

export function createNote(note: {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
}): Promise<Note> {
  return request<Note>("/notes", { method: "POST", body: note, auth: true });
}

export function updateNote(
  id: number,
  changes: Partial<{ title: string; content: string; tags: string[]; pinned: boolean }>,
): Promise<Note> {
  return request<Note>(`/notes/${id}`, { method: "PATCH", body: changes, auth: true });
}

export function deleteNote(id: number): Promise<{ deleted: boolean; id: number }> {
  return request<{ deleted: boolean; id: number }>(`/notes/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export function listTags(): Promise<{ items: TagCount[] }> {
  return request<{ items: TagCount[] }>("/tags");
}

export function listAuthors(): Promise<{ items: AuthorCount[] }> {
  return request<{ items: AuthorCount[] }>("/authors");
}
