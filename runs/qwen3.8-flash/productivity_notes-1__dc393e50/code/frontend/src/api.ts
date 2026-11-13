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

export interface NoteListResponse {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface Session {
  token: string;
  username: string;
}

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string[]>;

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const errorsToFields = (errors: unknown): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  if (errors && typeof errors === "object") {
    for (const [k, v] of Object.entries(errors as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.map(String);
      else if (v != null) out[k] = [String(v)];
    }
  }
  return out;
};

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== "" && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url.pathname + url.search, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const obj = (data ?? {}) as Record<string, unknown>;
    const message = typeof obj.error === "string" ? obj.error : `request failed (${res.status})`;
    throw new ApiError(res.status, message, errorsToFields(obj.errors));
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/api/auth/register", { method: "POST", body: { username, password } }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("/api/auth/login", { method: "POST", body: { username, password } }),
  logout: (token: string) => request<void>("/api/auth/logout", { method: "POST", token }),
  me: (token: string) => request<{ username: string }>("/api/auth/me", { token }),
  listNotes: (query: { tag?: string; author?: string; q?: string; page?: number; page_size?: number }) =>
    request<NoteListResponse>("/api/notes", { query }),
  getNote: (id: number) => request<Note>(`/api/notes/${id}`),
  createNote: (token: string, body: { title: string; content: string; tags: string[]; pinned?: boolean }) =>
    request<Note>("/api/notes", { method: "POST", token, body }),
  updateNote: (token: string, id: number, body: Partial<{ title: string; content: string; tags: string[]; pinned: boolean }>) =>
    request<Note>(`/api/notes/${id}`, { method: "PATCH", token, body }),
  deleteNote: (token: string, id: number) => request<void>(`/api/notes/${id}`, { method: "DELETE", token }),
  listTags: () => request<{ items: TagCount[] }>("/api/tags"),
};

export function flattenFieldErrors(fields: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [field, msgs] of Object.entries(fields)) {
    for (const m of msgs) out.push(`${field}: ${m}`);
  }
  return out;
}
