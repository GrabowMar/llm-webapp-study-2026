export interface Track {
  id: number;
  title: string;
  artist: string;
  url: string;
  duration: number | null;
  play_count: number;
  created_at: string;
  added_by: string;
}

export interface TrackPage {
  items: Track[];
  total: number;
  page: number;
  page_size: number;
}

export interface NewTrack {
  title: string;
  artist: string;
  url: string;
  duration: string | null;
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const sentToken = authToken;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error: could not reach the server");
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const obj = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    if (res.status === 401 && sentToken && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, obj.error || `Request failed (${res.status})`, obj.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string } }>("POST", "/auth/login", {
      username,
      password,
    }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  listTracks: (q: string, page: number, pageSize: number) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    return request<TrackPage>("GET", `/tracks?${params}`);
  },
  addTrack: (track: NewTrack) => request<Track>("POST", "/tracks", track),
  deleteTrack: (id: number) => request<void>("DELETE", `/tracks/${id}`),
  recordPlay: (id: number) => request<Track>("POST", `/tracks/${id}/plays`),
};

export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "–:––";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
