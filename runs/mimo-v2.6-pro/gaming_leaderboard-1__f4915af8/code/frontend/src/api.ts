import type {
  AdminScoresResponse,
  LeaderboardResponse,
  MyScoresResponse,
  Period,
  Score,
  SubmittedScore,
} from "./types";

const TOKEN_KEY = "game-leaderboard-token";
const USER_KEY = "game-leaderboard-username";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function loadAuth(): { token: string; username: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USER_KEY);
    if (token && username) return { token, username };
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function saveAuth(token: string, username: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  } catch {
    /* storage unavailable */
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (options.body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string; token: string }>(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
  },

  login(username: string, password: string) {
    return request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  leaderboard(params: {
    period: Period;
    player?: string;
    limit?: number;
  }): Promise<LeaderboardResponse> {
    const query = new URLSearchParams();
    query.set("period", params.period);
    if (params.player) query.set("player", params.player);
    if (params.limit) query.set("limit", String(params.limit));
    return request<LeaderboardResponse>(`/api/leaderboard?${query}`);
  },

  submitScore(token: string, score: number): Promise<SubmittedScore> {
    return request<SubmittedScore>(
      "/api/scores",
      { method: "POST", body: JSON.stringify({ score }) },
      token,
    );
  },

  myScores(token: string): Promise<MyScoresResponse> {
    return request<MyScoresResponse>("/api/scores", {}, token);
  },

  adminScores(
    token: string,
    page: number,
    pageSize: number,
  ): Promise<AdminScoresResponse> {
    const query = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    return request<AdminScoresResponse>(`/api/admin/scores?${query}`, {}, token);
  },

  toggleScore(token: string, id: number): Promise<Score> {
    return request<Score>(
      `/api/admin/scores/${id}/toggle`,
      { method: "POST" },
      token,
    );
  },
};
