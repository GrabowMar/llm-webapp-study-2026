export interface NoteSummary {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
}

export interface Note {
  id: number;
  title: string;
  body: string;
  published: boolean;
  updated_at: string;
  author: string;
}

export interface PublicNote {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
  author: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = response.statusText || "Request failed";
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      // ignore non-JSON errors
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  login(username: string, password: string) {
    return request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  me() {
    return request<{ id: number; username: string }>("/api/auth/me");
  },
  logout() {
    return request<void>("/api/auth/logout", { method: "POST" });
  },
  listNotes() {
    return request<{ items: NoteSummary[] }>("/api/notes");
  },
  getNote(id: number) {
    return request<Note>(`/api/notes/${id}`);
  },
  createNote(input: { title?: string; body?: string; published?: boolean }) {
    return request<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateNote(
    id: number,
    input: { title?: string; body?: string; published?: boolean },
  ) {
    return request<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  deleteNote(id: number) {
    return request<void>(`/api/notes/${id}`, { method: "DELETE" });
  },
  async renderMarkdown(body: string): Promise<string> {
    const headers = new Headers({ "Content-Type": "application/json" });
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch("/api/render", {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new ApiError("Could not render preview", response.status);
    return response.text();
  },
  async publicNoteHtml(id: number): Promise<string> {
    const response = await fetch(`/api/public/notes/${id}/html`);
    if (!response.ok) throw new ApiError("Note not found", response.status);
    return response.text();
  },
  getPublicNote(id: number) {
    return request<PublicNote>(`/api/public/notes/${id}`);
  },
};
