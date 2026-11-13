export type User = { username: string; is_admin: boolean };
export type Score = {
  id: number;
  score: number;
  achieved_at: string;
  is_hidden: boolean;
  player: string;
};
export type RankedPlayer = {
  rank: number;
  player: string;
  score: number;
  achieved_at: string;
};
export type Board = { items: RankedPlayer[]; total: number };
export type PersonalScores = { items: Score[]; best_score: number | null };
export type Submission = Score & { rank: number; personal_best: boolean };
export type AdminScores = { items: Score[]; total: number; page: number; page_size: number };
export type Period = "all" | "week" | "today";

export function savedToken(): string | null {
  try {
    return localStorage.getItem("highscore-token");
  } catch {
    return null;
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem("highscore-token", token);
    else localStorage.removeItem("highscore-token");
  } catch {
    return;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { ...options, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event("session-expired"));
    throw new Error(body?.error || "Something went wrong. Please try again.");
  }
  return body as T;
}

export function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function date(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : "Unable to connect. Please try again.";
}
