export interface Score {
  id: number;
  score: number;
  achieved_at: string;
  is_hidden: boolean;
  player: string;
}

export interface ScoreResult extends Score {
  rank: number | null;
  personal_best: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  player: string;
  score: number;
  achieved_at: string;
}

export interface LeaderboardResponse {
  items: LeaderboardEntry[];
  total: number;
}

export interface ScoresResponse {
  items: Score[];
  best_score: number | null;
}

export interface AdminScoresResponse {
  items: Score[];
  total: number;
  page: number;
  page_size: number;
}

const TOKEN_KEY = "leaderboard_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function getLeaderboard(params: {
  period?: string;
  player?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params.period) q.set("period", params.period);
  if (params.player) q.set("player", params.player);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<LeaderboardResponse>(`/api/leaderboard${qs ? `?${qs}` : ""}`);
}

export function submitScore(score: number) {
  return request<ScoreResult>("/api/scores", {
    method: "POST",
    body: JSON.stringify({ score }),
  });
}

export function getMyScores() {
  return request<ScoresResponse>("/api/scores");
}

export function getAdminScores(page = 1, pageSize = 10) {
  return request<AdminScoresResponse>(
    `/api/admin/scores?page=${page}&page_size=${pageSize}`
  );
}

export function toggleScore(id: number) {
  return request<Score>(`/api/admin/scores/${id}/toggle`, { method: "POST" });
}
