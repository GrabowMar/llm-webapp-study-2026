import type { Preview, PreviewPage, Session } from "./types";

const TOKEN_KEY = "linkpreviews.token";
const USERNAME_KEY = "linkpreviews.username";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  return token && username ? { token, username } : null;
}

export function saveSession(session: Session): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USERNAME_KEY, session.username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const session = loadSession();
  if (session) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
      ) {
        message = (body as { error: string }).error;
      }
    } catch {
      // body was not JSON; keep the generic message
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function register(username: string, password: string): Promise<{ username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listPreviews(page: number, pageSize: number): Promise<PreviewPage> {
  return request(`/api/previews?page=${page}&page_size=${pageSize}`);
}

export function createPreview(url: string): Promise<Preview> {
  return request("/api/previews", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function refreshPreview(id: number): Promise<Preview> {
  return request(`/api/previews/${id}/refresh`, { method: "POST" });
}

export function deletePreview(id: number): Promise<void> {
  return request(`/api/previews/${id}`, { method: "DELETE" });
}
