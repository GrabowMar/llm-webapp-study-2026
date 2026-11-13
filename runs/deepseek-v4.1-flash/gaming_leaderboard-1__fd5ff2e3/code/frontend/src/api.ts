export type Period = "all" | "week" | "today";

export interface Score {
  id: number;
  score: number;
  achieved_at: string;
  is_hidden: boolean;
  player: string;
}

export interface NewScore extends Score {
  rank: number | null;
  personal_best: boolean;
}

export interface LeaderboardItem {
  rank: number;
  player: string;
  score: number;
  achieved_at: string;
}

export interface LeaderboardResponse {
  items: LeaderboardItem[];
  total: number;
}

export interface MyScoresResponse {
  items: Score[];
  best_score: number | null;
}

export interface AdminScoresResponse {
  items: Score[];
  total: number;
  page: number;
  page_size: number;
}

export interface Session {
  username: string;
  is_admin: boolean;
}

const TOKEN_KEY = "leaderboard.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`/api${path}`, { ...options, headers });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false,
    );
  },
  async login(username: string, password: string) {
    const result = await request<{ token: string }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false,
    );
    setToken(result.token);
    return result;
  },
  me() {
    return request<Session>("/auth/me");
  },
  logout() {
    return request<{ status: string }>("/auth/logout", { method: "POST" });
  },
  leaderboard(period: Period, player: string, limit?: number) {
    const params = new URLSearchParams({ period });
    if (player.trim()) params.set("player", player.trim());
    if (limit !== undefined) params.set("limit", String(limit));
    return request<LeaderboardResponse>(`/leaderboard?${params}`);
  },
  submitScore(score: number) {
    return request<NewScore>("/scores", {
      method: "POST",
      body: JSON.stringify({ score }),
    });
  },
  myScores() {
    return request<MyScoresResponse>("/scores");
  },
  adminScores(page: number, pageSize: number) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    return request<AdminScoresResponse>(`/admin/scores?${params}`);
  },
  toggleScore(id: number) {
    return request<Score>(`/admin/scores/${id}/toggle`, { method: "POST" });
  },
};
