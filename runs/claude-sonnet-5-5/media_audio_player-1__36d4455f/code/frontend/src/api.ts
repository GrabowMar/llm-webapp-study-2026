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

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "token";
const USER_KEY = "username";

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get username() {
    return localStorage.getItem(USER_KEY);
  },
  set(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = session.token;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error, please try again");
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/")) onUnauthorized();
    throw new ApiError(
      res.status,
      (data && data.error) || `Request failed (${res.status})`,
      (data && data.errors) || {},
    );
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  listTracks: (q: string, page: number, pageSize: number) => {
    const p = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (q) p.set("q", q);
    return request<TrackPage>("GET", `/tracks?${p}`);
  },
  addTrack: (t: { title: string; artist: string; url: string; duration?: number }) =>
    request<Track>("POST", "/tracks", t),
  deleteTrack: (id: number) => request<void>("DELETE", `/tracks/${id}`),
  recordPlay: (id: number) => request<Track>("POST", `/tracks/${id}/plays`),
};

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
