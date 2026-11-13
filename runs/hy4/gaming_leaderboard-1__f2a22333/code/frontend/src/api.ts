export type Score = {
  id: number;
  score: number;
  achieved_at: string;
  is_hidden: boolean;
  player: string;
};

export type SubmittedScore = Score & {
  rank: number;
  personal_best: boolean;
};

export type LeaderboardItem = {
  rank: number;
  player: string;
  score: number;
  achieved_at: string;
};

export type Period = "all" | "week" | "today";

export type ApiError = Error & { status: number; body: unknown };

async function parse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) || `Request failed (${response.status})`,
    ) as ApiError;
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data as T;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(response);
}
