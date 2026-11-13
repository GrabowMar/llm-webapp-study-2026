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

export type TagCount = { tag: string; count: number };

export type NoteListResponse = {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
};

export type NoteDraft = {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
};

export type NoteFilters = {
  q: string;
  author: string;
  tag: string;
  page: number;
  page_size?: number;
};

const TOKEN_KEY = "tagged_notes_token";
const USERNAME_KEY = "tagged_notes_username";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    if (data && typeof data === "object" && "error" in data) {
      const value = (data as { error: unknown }).error;
      if (typeof value === "string") message = value;
    }
    if (res.status === 401 && token) {
      clearSession();
      unauthorizedHandler?.();
    }
    throw new ApiError(message, res.status);
  }

  return data as T;
}

function notesQuery(filters: NoteFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.author.trim()) params.set("author", filters.author.trim());
  if (filters.tag.trim()) params.set("tag", filters.tag.trim());
  params.set("page", String(filters.page));
  params.set("page_size", String(filters.page_size ?? 10));
  return params.toString();
}

export const api = {
  register(username: string, password: string): Promise<{ id: number; username: string }> {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  login(username: string, password: string): Promise<{ token: string }> {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  listNotes(filters: NoteFilters): Promise<NoteListResponse> {
    return request(`/api/notes?${notesQuery(filters)}`);
  },

  getNote(id: number): Promise<Note> {
    return request(`/api/notes/${id}`);
  },

  createNote(draft: NoteDraft): Promise<Note> {
    return request("/api/notes", { method: "POST", body: JSON.stringify(draft) });
  },

  updateNote(id: number, draft: Partial<NoteDraft>): Promise<Note> {
    return request(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
  },

  deleteNote(id: number): Promise<unknown> {
    return request(`/api/notes/${id}`, { method: "DELETE" });
  },

  listTags(): Promise<{ items: TagCount[] }> {
    return request("/api/tags");
  },
};
