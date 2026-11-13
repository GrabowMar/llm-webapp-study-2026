import type {
  AdminScoresResponse,
  LeaderboardResponse,
  MyScoresResponse,
  Period,
  SubmittedScore,
  User,
} from "./types";

const TOKEN_KEY = "leaderboard_token";

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
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable, the session simply does not persist */
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

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
    const message =
      (payload as { error?: string } | null)?.error ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
    });
  },

  async login(username: string, password: string): Promise<string> {
    const result = await request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    return result.token;
  },

  logout() {
    return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },

  me() {
    return request<User>("/api/auth/me");
  },

  leaderboard(options: { period: Period; limit?: number; player?: string }) {
    return request<LeaderboardResponse>(
      `/api/leaderboard${query({
        period: options.period,
        limit: options.limit,
        player: options.player,
      })}`,
    );
  },

  submitScore(score: number) {
    return request<SubmittedScore>("/api/scores", { method: "POST", body: { score } });
  },

  myScores() {
    return request<MyScoresResponse>("/api/scores");
  },

  adminScores(page: number, pageSize: number) {
    return request<AdminScoresResponse>(`/api/admin/scores${query({ page, page_size: pageSize })}`);
  },

  toggleScore(id: number) {
    return request<{ is_hidden: boolean }>(`/api/admin/scores/${id}/toggle`, { method: "POST" });
  },
};
