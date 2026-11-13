export type Option = "A" | "B" | "C" | "D";

export interface QuizQuestion {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface Question extends QuizQuestion {
  correct_option: Option;
}

export interface ReviewAnswer extends Question {
  question_id: number;
  selected: Option | null;
  is_correct: boolean;
}

export interface Attempt {
  id: number;
  score: number;
  correct: number;
  total_questions: number;
  submitted_at: string;
  answers: ReviewAnswer[];
}

export interface Me {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string>;
}

const TOKEN_KEY = "quiz.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(path, { ...init, headers });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // non-JSON response
  }
  if (!response.ok) {
    const err: ApiError =
      data && typeof data === "object"
        ? (data as ApiError)
        : { message: `Request failed (${response.status})` };
    throw err;
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as ApiError).message);
  }
  return "Something went wrong. Please try again.";
}

export const api = {
  register: (username: string, password: string) =>
    request<Me & { token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<Me>("/api/auth/me"),
  quiz: (count: number) => request<{ items: QuizQuestion[] }>(`/api/quiz?count=${count}`),
  submit: (answers: { question_id: number; selected: Option | null }[]) =>
    request<Attempt>("/api/attempts", {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  attempts: () => request<{ items: Attempt[] }>("/api/attempts"),
  attempt: (id: number) => request<Attempt>(`/api/attempts/${id}`),
  addQuestion: (question: {
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: Option;
  }) =>
    request<Question>("/api/admin/questions", {
      method: "POST",
      body: JSON.stringify(question),
    }),
  questions: (page: number, pageSize: number) =>
    request<{ items: Question[]; total: number; page: number; page_size: number }>(
      `/api/admin/questions?page=${page}&page_size=${pageSize}`,
    ),
};

export const optionLabels: Option[] = ["A", "B", "C", "D"];

export function optionText(question: QuizQuestion, option: Option): string {
  return question[
    ({ A: "option_a", B: "option_b", C: "option_c", D: "option_d" } as const)[option]
  ];
}
