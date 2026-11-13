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

export type Period = "all" | "week" | "today";
