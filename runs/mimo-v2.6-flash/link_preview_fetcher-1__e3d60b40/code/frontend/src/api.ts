export const TOKEN_KEY = "link-previews.token";
export const USERNAME_KEY = "link-previews.username";

export interface Preview {
  id: number;
  url: string;
  final_url: string;
  status_code: number;
  title: string;
  description: string;
  image_url: string;
  fetched_at: string;
}

export interface PreviewPage {
  items: Preview[];
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

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (body && typeof body.error === "string" && body.error) {
        message = body.error;
      }
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function register(username: string, password: string): Promise<unknown> {
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
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return request(`/api/previews?${params.toString()}`);
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
