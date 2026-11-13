export type Option = "A" | "B" | "C" | "D";
export const OPTIONS: Option[] = ["A", "B", "C", "D"];

export interface Question {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: Option;
}

export interface Answer extends Question {
  question_id: number;
  selected: Option;
  correct_option: Option;
  is_correct: boolean;
}

export interface Attempt {
  id: number | null;
  score: number;
  correct: number;
  total_questions: number;
  submitted_at: string;
  answers: Answer[];
}

export interface User {
  username: string;
  is_admin: boolean;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function getToken(): string | null {
  try { return localStorage.getItem("quizly_token"); } catch { return null; }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem("quizly_token", token);
    else localStorage.removeItem("quizly_token");
  } catch { return; }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError("We couldn’t connect. Check your connection and try again.", 0);
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("quizly:session-expired"));
    }
    throw new ApiError(data.error || "Something went wrong. Please try again.", response.status, data.errors);
  }
  return data as T;
}

export function optionText(question: Question, option: Option) {
  return question[`option_${option.toLowerCase()}` as "option_a" | "option_b" | "option_c" | "option_d"];
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
