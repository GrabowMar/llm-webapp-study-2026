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

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("We couldn’t reach the gallery. Check your connection and try again.", { cause: error });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event("folio:session-expired"));
    throw new ApiError(data.error || "Something went wrong. Please try again.", response.status);
  }
  return data as T;
}

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

export function readToken() {
  try { return localStorage.getItem("folio-token"); } catch { return null; }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem("folio-token", token);
    else localStorage.removeItem("folio-token");
  } catch { return; }
}
