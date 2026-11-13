export interface ImageItem {
  id: number;
  filename: string;
  title: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  url: string;
  uploader: string;
}

export interface ImageList {
  items: ImageItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface Session {
  token: string;
  username: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const SESSION_KEY = "gallery.session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    if (
      parsed &&
      typeof parsed.token === "string" &&
      typeof parsed.username === "string"
    ) {
      return { token: parsed.token, username: parsed.username };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

async function errorFromResponse(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (body && typeof body.error === "string" && body.error) {
      return body.error;
    }
  } catch {
    // ignore malformed error bodies
  }
  return `Request failed with status ${response.status}`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  session?: Session | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (session) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    throw new ApiError(await errorFromResponse(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function register(
  username: string,
  password: string,
): Promise<void> {
  await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(
  username: string,
  password: string,
): Promise<Session> {
  const body = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return { token: body.token, username };
}

export async function listImages(
  page: number,
  pageSize: number,
): Promise<ImageList> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  return request<ImageList>(`/api/images?${query.toString()}`);
}

export async function createImage(
  image: { filename: string; data: string; title?: string },
  session: Session,
): Promise<ImageItem> {
  return request<ImageItem>("/api/images", {
    method: "POST",
    body: JSON.stringify(image),
  }, session);
}

export async function deleteImage(
  id: number,
  session: Session,
): Promise<void> {
  await request<void>(`/api/images/${id}`, { method: "DELETE" }, session);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
