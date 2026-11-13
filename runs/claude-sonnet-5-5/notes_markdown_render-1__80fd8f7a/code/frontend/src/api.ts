export type NoteSummary = {
  id: number;
  title: string;
  published: boolean;
  updated_at: string;
};

export type Note = NoteSummary & { body: string; author: string };

export type PublicNote = {
  id: number;
  title: string;
  author: string;
  updated_at: string;
  html: string;
};

const TOKEN_KEY = "notes.token";
const USER_KEY = "notes.username";

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get username() {
    return localStorage.getItem(USER_KEY);
  },
  set(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = session.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText || "Request failed";
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      /* non-JSON error */
    }
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, message);
  }
  return res;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const api = {
  async register(username: string, password: string) {
    await request("/auth/register", { method: "POST", ...json({ username, password }) });
  },
  async login(username: string, password: string): Promise<string> {
    const res = await request("/auth/login", { method: "POST", ...json({ username, password }) });
    return (await res.json()).token as string;
  },
  async listNotes(): Promise<NoteSummary[]> {
    return (await (await request("/notes")).json()).items;
  },
  async createNote(title: string, body: string): Promise<Note> {
    return (await request("/notes", { method: "POST", ...json({ title, body }) })).json();
  },
  async getNote(id: number): Promise<Note> {
    return (await request(`/notes/${id}`)).json();
  },
  async updateNote(
    id: number,
    patch: Partial<Pick<Note, "title" | "body" | "published">>,
  ): Promise<Note> {
    return (await request(`/notes/${id}`, { method: "PATCH", ...json(patch) })).json();
  },
  async deleteNote(id: number): Promise<void> {
    await request(`/notes/${id}`, { method: "DELETE" });
  },
  async noteHtml(id: number): Promise<string> {
    return (await request(`/notes/${id}/html`)).text();
  },
  async publicNote(id: number): Promise<PublicNote> {
    return (await request(`/public/notes/${id}`)).json();
  },
};
