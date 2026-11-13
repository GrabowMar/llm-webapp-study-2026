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

export interface TagListResponse {
  items: TagCount[];
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function token(): string | null {
  return localStorage.getItem("token");
}

export function setToken(value: string | null) {
  if (value) {
    localStorage.setItem("token", value);
  } else {
    localStorage.removeItem("token");
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string }>("POST", "/api/auth/register", {
    username,
    password,
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("POST", "/api/auth/login", {
    username,
    password,
  });
}

export function listNotes(params: {
  tag?: string;
  author?: string;
  q?: string;
  page?: number;
  page_size?: number;
}) {
  const qs = new URLSearchParams();
  if (params.tag) qs.set("tag", params.tag);
  if (params.author) qs.set("author", params.author);
  if (params.q) qs.set("q", params.q);
  qs.set("page", String(params.page ?? 1));
  qs.set("page_size", String(params.page_size ?? 10));
  return request<NoteListResponse>("GET", `/api/notes?${qs.toString()}`);
}

export function getNote(id: number) {
  return request<Note>("GET", `/api/notes/${id}`);
}

export function createNote(input: {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
}) {
  return request<Note>("POST", "/api/notes", input);
}

export function updateNote(
  id: number,
  input: Partial<{ title: string; content: string; tags: string[]; pinned: boolean }>,
) {
  return request<Note>("PATCH", `/api/notes/${id}`, input);
}

export function deleteNote(id: number) {
  return request<void>("DELETE", `/api/notes/${id}`);
}

export function listTags() {
  return request<TagListResponse>("GET", "/api/tags");
}
