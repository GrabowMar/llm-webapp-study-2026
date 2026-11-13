export interface GalleryImage {
  id: number;
  filename: string;
  title: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  url: string;
  uploader: string;
}

export interface ImagePage {
  items: GalleryImage[];
  total: number;
  page: number;
  page_size: number;
}

export interface Session {
  token: string;
  username: string;
}

export interface UploadPayload {
  filename: string;
  data: string;
  title?: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "gallery.token";
const USERNAME_KEY = "gallery.username";

export function loadSession(): Session | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USERNAME_KEY);
    return token && username ? { token, username } : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(USERNAME_KEY, session.username);
  } catch {
    // Storage can be unavailable; the session still works for this tab.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("Network error. Please try again.", 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload !== null &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export function register(username: string, password: string): Promise<{ username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function logout(token: string): Promise<unknown> {
  return request("/api/auth/logout", { method: "POST", token });
}

export function listImages(page: number, pageSize: number): Promise<ImagePage> {
  return request(`/api/images?page=${page}&page_size=${pageSize}`);
}

export function uploadImage(token: string, payload: UploadPayload): Promise<GalleryImage> {
  return request("/api/images", { method: "POST", token, body: payload });
}

export function deleteImage(token: string, id: number): Promise<{ ok: boolean }> {
  return request(`/api/images/${id}`, { method: "DELETE", token });
}
