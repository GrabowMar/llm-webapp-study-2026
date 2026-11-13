export interface Preview {
  id: number;
  url: string;
  final_url: string | null;
  status_code: number | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  fetched_at: string;
}

export interface PreviewPage {
  items: Preview[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuthResponse {
  token: string;
}

const TOKEN_KEY = "linkpreview.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") {
        message = data.error;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function register(
  username: string,
  password: string,
): Promise<{ username: string }> {
  return apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function me(): Promise<{ username: string }> {
  return apiRequest("/api/auth/me");
}

export function listPreviews(
  page: number,
  pageSize: number,
): Promise<PreviewPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  return apiRequest(`/api/previews?${params.toString()}`);
}

export function createPreview(url: string): Promise<Preview> {
  return apiRequest("/api/previews", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function refreshPreview(id: number): Promise<Preview> {
  return apiRequest(`/api/previews/${id}/refresh`, { method: "POST" });
}

export function deletePreview(id: number): Promise<void> {
  return apiRequest(`/api/previews/${id}`, { method: "DELETE" });
}
