export type Period = "all" | "week" | "day";

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface Score {
  id: number;
  score: number;
  achieved_at: string;
  is_hidden: boolean;
  player: string;
}

export interface SubmittedScore extends Score {
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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "leaderboard_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<User>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>("POST", "/auth/login", { username, password }),
  logout: () => request<{ status: string }>("POST", "/auth/logout"),
  me: () => request<User>("GET", "/auth/me"),
  leaderboard: (period: Period, limit: number, player: string) => {
    const params = new URLSearchParams({ period, limit: String(limit) });
    if (player.trim()) params.set("player", player.trim());
    return request<LeaderboardResponse>("GET", `/leaderboard?${params}`);
  },
  submitScore: (score: number) => request<SubmittedScore>("POST", "/scores", { score }),
  myScores: () => request<MyScoresResponse>("GET", "/scores"),
  adminScores: (page: number, pageSize: number) =>
    request<AdminScoresResponse>("GET", `/admin/scores?page=${page}&page_size=${pageSize}`),
  toggleScore: (id: number) => request<Score>("POST", `/admin/scores/${id}/toggle`),
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatScore(n: number): string {
  return n.toLocaleString();
}
