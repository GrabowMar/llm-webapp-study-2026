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

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) message = text;
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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

export function listImages(page: number, pageSize: number): Promise<ImagePage> {
  return request(`/api/images?page=${page}&page_size=${pageSize}`);
}

export function createImage(
  token: string,
  payload: { filename: string; data: string; title?: string },
): Promise<GalleryImage> {
  return request("/api/images", { method: "POST", token, body: payload });
}

export function deleteImage(token: string, id: number): Promise<void> {
  return request(`/api/images/${id}`, { method: "DELETE", token });
}
