export type Score = {
  id: number;
  score: number;
  achieved_at: string;
  is_hidden: boolean;
  player: string;
};

export type LeaderboardItem = {
  rank: number;
  player: string;
  score: number;
  achieved_at: string;
};

export type ScoreWithRank = Score & { rank: number | null; personal_best: boolean };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "leaderboard.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request<{ username: string }>("/api/auth/register", {
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

export type Period = "all" | "week" | "day";

export function getLeaderboard(period: Period, limit = 50, player?: string) {
  const params = new URLSearchParams({ period, limit: String(limit) });
  if (player) params.set("player", player);
  return request<{ items: LeaderboardItem[]; total: number }>(`/api/leaderboard?${params}`);
}

export function submitScore(score: number) {
  return request<ScoreWithRank>("/api/scores", {
    method: "POST",
    body: JSON.stringify({ score }),
  });
}

export function getMyScores() {
  return request<{ items: Score[]; best_score: number | null }>("/api/scores");
}

export function getAdminScores(page: number, pageSize: number) {
  return request<{ items: Score[]; total: number; page: number; page_size: number }>(
    `/api/admin/scores?page=${page}&page_size=${pageSize}`,
  );
}

export function toggleAdminScore(id: number) {
  return request<Score>(`/api/admin/scores/${id}/toggle`, { method: "POST" });
}
