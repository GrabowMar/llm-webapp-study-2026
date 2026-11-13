export interface Track {
  id: number;
  title: string;
  artist: string;
  url: string;
  duration: number | string;
  play_count: number;
  created_at: string;
  added_by: string;
  owned_by_me?: boolean;
}

export interface Page {
  items: Track[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiError {
  error: string;
  errors?: Record<string, string>;
}

const TOKEN_KEY = "soundboard.token";
const USER_KEY = "soundboard.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class HttpError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth && getToken()) {
    headers["Authorization"] = `Bearer ${getToken()}`;
  }
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let data: ApiError = { error: `Request failed (${response.status})` };
    try {
      data = await response.json();
    } catch {
      // keep the fallback message
    }
    throw new HttpError(response.status, data);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function formatDuration(duration: number | string): string {
  if (typeof duration === "string") return duration;
  if (!Number.isFinite(duration) || duration < 0) return "—";
  const total = Math.floor(duration);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function durationSeconds(duration: number | string): number | null {
  if (typeof duration === "number") return Number.isFinite(duration) ? duration : null;
  if (/^\d+$/.test(duration)) return Number(duration);
  const parts = duration.split(":").map(Number);
  if (parts.length >= 2 && parts.every((p) => Number.isFinite(p))) {
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const n = Number(duration);
  return Number.isFinite(n) ? n : null;
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function errorFields(err: unknown): Record<string, string> {
  if (err instanceof HttpError && err.body.errors) return err.body.errors;
  return {};
}

export function errorMessage(err: unknown): string {
  if (err instanceof HttpError) return err.body.error || err.message;
  return err instanceof Error ? err.message : "Something went wrong";
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string; token: string }>("/auth/register", {
      method: "POST",
      body: { username, password },
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: { username, password },
    }),
  listTracks: (q: string, page: number, pageSize: number) =>
    request<Page>(
      `/tracks?q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`,
      { auth: true },
    ),
  addTrack: (data: {
    title: string;
    artist: string;
    url: string;
    duration: number | string;
  }) => request<Track>("/tracks", { method: "POST", body: data, auth: true }),
  deleteTrack: (id: number) =>
    request<void>(`/tracks/${id}`, { method: "DELETE", auth: true }),
  recordPlay: (id: number) =>
    request<Track>(`/tracks/${id}/plays`, { method: "POST", auth: true }),
};
