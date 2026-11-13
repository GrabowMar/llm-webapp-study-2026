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

export interface TrackPage {
  items: Track[];
  total: number;
  page: number;
  page_size: number;
}

const TOKEN_KEY = "audio-library-token";
const USERNAME_KEY = "audio-library-username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed (status ${res.status})`;
    try {
      const data: unknown = await res.json();
      if (typeof data === "object" && data !== null && "error" in data) {
        const value = (data as { error: unknown }).error;
        if (typeof value === "string" && value) {
          message = value;
        }
      }
    } catch {
      if (res.status === 401) {
        message = "You need to sign in to do that.";
      }
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface Credentials {
  username: string;
  password: string;
}

export function register(creds: Credentials): Promise<{ username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(creds),
  });
}

export async function login(creds: Credentials): Promise<string> {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(creds),
  });
  saveSession(data.token, creds.username.trim());
  return data.token;
}

export function me(): Promise<{ username: string }> {
  return request("/api/auth/me");
}

export function listTracks(q: string, page: number, pageSize: number): Promise<TrackPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q.trim()) {
    params.set("q", q.trim());
  }
  return request(`/api/tracks?${params.toString()}`);
}

export interface TrackInput {
  title: string;
  artist: string;
  url: string;
  duration: number;
}

export function addTrack(input: TrackInput): Promise<Track> {
  return request("/api/tracks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteTrack(id: number): Promise<void> {
  return request(`/api/tracks/${id}`, { method: "DELETE" });
}

export function addPlay(id: number): Promise<Track> {
  return request(`/api/tracks/${id}/plays`, { method: "POST" });
}
