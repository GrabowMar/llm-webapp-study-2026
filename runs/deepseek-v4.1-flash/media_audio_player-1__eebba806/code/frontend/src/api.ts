import type { Session, Track, TrackInput, TrackPage } from "./types";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && (data.message || data.error)) || `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, (data && data.errors) || {});
  }
  return data as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
    });
  },

  login(username: string, password: string) {
    return request<Session>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
  },

  logout(token: string) {
    return request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      token,
    });
  },

  tracks(params: { q: string; page: number; pageSize: number }) {
    const search = new URLSearchParams({
      q: params.q,
      page: String(params.page),
      page_size: String(params.pageSize),
    });
    return request<TrackPage>(`/api/tracks?${search.toString()}`);
  },

  createTrack(token: string, input: TrackInput) {
    return request<Track>("/api/tracks", {
      method: "POST",
      token,
      body: input,
    });
  },

  deleteTrack(token: string, id: number) {
    return request<void>(`/api/tracks/${id}`, { method: "DELETE", token });
  },

  play(id: number) {
    return request<Track>(`/api/tracks/${id}/plays`, { method: "POST" });
  },
};
