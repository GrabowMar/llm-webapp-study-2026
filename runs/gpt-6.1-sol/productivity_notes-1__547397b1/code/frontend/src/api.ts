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

export type NotePage = { items: Note[]; total: number; page: number; page_size: number };
export type Tag = { tag: string; count: number };
export type Session = { token: string; username: string };
export type FieldErrors = Record<string, string>;
export type NoteDraft = Pick<Note, "title" | "content" | "tags" | "pinned">;

export class ApiError extends Error {
  status: number;
  errors: FieldErrors;

  constructor(message: string, status: number, errors: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("We couldn’t reach the notebook. Please try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({ error: "Something went wrong. Please try again." }));
  if (!response.ok) {
    if (response.status === 401 && options.token) window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(data.error ?? "Something went wrong. Please try again.", response.status, data.errors);
  }
  return data as T;
}

export function readSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem("marginalia-session") ?? "null");
    return typeof value?.token === "string" && typeof value?.username === "string" ? value : null;
  } catch {
    return null;
  }
}

export function storeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem("marginalia-session", JSON.stringify(session));
    else localStorage.removeItem("marginalia-session");
  } catch {
    return;
  }
}

export function dateLabel(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function relativeDate(date: string) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
