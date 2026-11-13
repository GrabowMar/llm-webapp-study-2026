export interface Note {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
  author: string;
}

export interface NotesPage {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagsResponse {
  items: TagCount[];
}

export interface ValidationError {
  message: string;
  status: number;
  fields: Record<string, string>;
}

const TOKEN_KEY = "tagged-notes-token";
const USER_KEY = "tagged-notes-username";

export function loadSession(): { token: string; username: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  if (!token || !username) return null;
  return { token, username };
}

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const payload = (data ?? {}) as {
      error?: string;
      errors?: Record<string, string>;
      message?: string;
    };
    const fields = payload.errors ?? {};
    const message =
      payload.error ??
      payload.message ??
      Object.values(fields)[0] ??
      `Request failed (${response.status}).`;
    const error: ValidationError = { message, status: response.status, fields };
    throw error;
  }

  return data as T;
}
