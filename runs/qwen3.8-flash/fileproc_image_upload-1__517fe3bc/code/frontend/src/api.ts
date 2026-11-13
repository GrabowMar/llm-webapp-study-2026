export interface Image {
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
  items: Image[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, options);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message);
  }
  return body as T;
}

function jsonHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password }),
  });
}

export function register(username: string, password: string): Promise<{ username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password }),
  });
}

export function logout(token: string): Promise<unknown> {
  return request("/api/auth/logout", { method: "POST", headers: jsonHeaders(token) });
}

export function listImages(page: number, pageSize: number): Promise<ImageList> {
  return request(`/api/images?page=${page}&page_size=${pageSize}`);
}

export function uploadImage(
  token: string,
  filename: string,
  dataBase64: string,
  title: string | null,
): Promise<Image> {
  return request("/api/images", {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({ filename, data: dataBase64, title: title || null }),
  });
}

export function deleteImage(token: string, id: number): Promise<unknown> {
  return request(`/api/images/${id}`, { method: "DELETE", headers: jsonHeaders(token) });
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}
