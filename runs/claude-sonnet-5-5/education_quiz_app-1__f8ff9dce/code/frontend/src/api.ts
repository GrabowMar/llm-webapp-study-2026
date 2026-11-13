export type Letter = "A" | "B" | "C" | "D";
export const LETTERS: Letter[] = ["A", "B", "C", "D"];

export interface QuizQuestion {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface Question extends QuizQuestion {
  correct_option: Letter;
}

export interface ReviewItem extends QuizQuestion {
  question_id: number;
  selected: Letter;
  correct_option: Letter;
  is_correct: boolean;
}

export interface Attempt {
  id: number | null;
  score: number;
  correct: number;
  total_questions: number;
  submitted_at: string;
  answers: ReviewItem[];
}

export interface Me {
  username: string;
  is_admin: boolean;
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;
  constructor(message: string, status: number, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "quiz_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token && options.auth !== false) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Network error, please try again", 0);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.errors ?? {});
  }
  return data as T;
}

export const optionText = (q: QuizQuestion, l: Letter): string =>
  q[`option_${l.toLowerCase()}` as "option_a"];
