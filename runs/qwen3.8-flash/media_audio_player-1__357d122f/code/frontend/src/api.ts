export interface Track {
  id: number;
  title: string;
  artist: string;
  url: string;
  duration: number;
  play_count: number;
  created_at: string;
  added_by: string;
}

export interface TrackList {
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

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; fields?: Record<string, string> };
    throw new ApiError(res.status, b.error ?? `request failed (${res.status})`, b.fields ?? {});
  }
  return body as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: (token: string) => request<{ username: string }>("/api/auth/me", {}, token),
  listTracks: (params: { q: string; page: number; pageSize: number }) => {
    const qs = new URLSearchParams({
      page: String(params.page),
      page_size: String(params.pageSize),
    });
    if (params.q) qs.set("q", params.q);
    return request<TrackList>(`/api/tracks?${qs}`);
  },
  addTrack: (token: string, payload: { title: string; artist: string; url: string; duration: number }) =>
    request<Track>("/api/tracks", { method: "POST", body: JSON.stringify(payload) }, token),
  deleteTrack: (token: string, id: number) =>
    request<void>(`/api/tracks/${id}`, { method: "DELETE" }, token),
  registerPlay: (id: number) => request<Track>(`/api/tracks/${id}/plays`, { method: "POST" }),
};
