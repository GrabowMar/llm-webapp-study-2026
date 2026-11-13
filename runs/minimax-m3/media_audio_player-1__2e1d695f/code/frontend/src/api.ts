import type { AuthResponse, Track, TrackPage, User } from "./types";

const TOKEN_KEY = "audio-library.token";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable (private mode) - the session just won't persist */
  }
}

async function request<T>(path: string, options: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; errors?: Record<string, string> };
    const message =
      body.error || (response.status === 404 ? "Not found" : `Request failed (${response.status})`);
    throw new ApiError(response.status, message, body.errors ?? {});
  }

  return payload as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  login(username: string, password: string) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  },
  me() {
    return request<User & { created_at?: string }>("/auth/me");
  },
  listTracks(params: { q?: string; page?: number; pageSize?: number }) {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("page_size", String(params.pageSize));
    const query = search.toString();
    return request<TrackPage>(`/tracks${query ? `?${query}` : ""}`);
  },
  createTrack(track: { title: string; artist: string; url: string; duration: string }) {
    return request<Track>("/tracks", {
      method: "POST",
      body: JSON.stringify(track),
    });
  },
  deleteTrack(id: number) {
    return request<{ ok: boolean; id: number }>(`/tracks/${id}`, { method: "DELETE" });
  },
  registerPlay(id: number) {
    return request<Track>(`/tracks/${id}/plays`, { method: "POST", auth: false });
  },
};
