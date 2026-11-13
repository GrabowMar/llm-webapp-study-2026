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

interface AuthResponse {
  token: string;
  username: string;
}

const TOKEN_KEY = "audio_player_token";
const USERNAME_KEY = "audio_player_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listTracks(
  q: string,
  page: number,
  pageSize: number,
): Promise<TrackPage> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return request<TrackPage>(`/api/tracks?${params.toString()}`);
}

export function addTrack(input: {
  title: string;
  artist: string;
  url: string;
  duration?: number;
}): Promise<Track> {
  return request<Track>("/api/tracks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteTrack(id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/tracks/${id}`, {
    method: "DELETE",
  });
}

export function recordPlay(id: number): Promise<Track> {
  return request<Track>(`/api/tracks/${id}/plays`, { method: "POST" });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
