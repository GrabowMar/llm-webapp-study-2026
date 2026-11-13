import type { LoginResponse, Track, TrackPage } from "./types";

const TOKEN_KEY = "audio-library.token";
const USER_KEY = "audio-library.username";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUsername(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function saveSession(token: string | null, username: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    if (username) {
      localStorage.setItem(USER_KEY, username);
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // storage unavailable: session stays in memory
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the server.", 0);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const record = (data ?? {}) as { error?: unknown; message?: unknown };
    const raw = record.error ?? record.message;
    const message =
      typeof raw === "string" && raw.trim()
        ? raw
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string }>("/auth/register", {
      method: "POST",
      body: { username, password },
    });
  },

  login(username: string, password: string) {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
  },

  logout() {
    return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  },

  listTracks(params: { q?: string; page?: number; page_size?: number }) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.page_size !== undefined) {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString();
    return request<TrackPage>(`/tracks${suffix ? `?${suffix}` : ""}`);
  },

  createTrack(input: {
    title: string;
    artist: string;
    url: string;
    duration: string;
  }) {
    const body: Record<string, unknown> = {
      title: input.title,
      artist: input.artist,
      url: input.url,
    };
    if (input.duration.trim() !== "") {
      body.duration = input.duration.trim();
    }
    return request<Track>("/tracks", { method: "POST", body });
  },

  deleteTrack(id: number) {
    return request<{ ok: boolean }>(`/tracks/${id}`, { method: "DELETE" });
  },

  addPlay(id: number) {
    return request<Track>(`/tracks/${id}/plays`, { method: "POST" });
  },
};
