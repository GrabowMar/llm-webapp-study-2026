export type User = { id: number; username: string; is_admin: boolean };

export type Link = {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
  short_url: string;
  owner: string;
  is_active: boolean;
};

export type Page = { items: Link[]; total: number; page: number; page_size: number };
export type Stats = { total_links: number; total_clicks: number; links_today: number };

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Unable to connect. Check your connection and try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong. Please try again.", response.status);
  return body as T;
}

export function fullShortUrl(link: Link) {
  return new URL(link.short_url, window.location.origin).href;
}
