export interface QuizQuestion {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface ReviewAnswer extends QuizQuestion {
  correct_option: "A" | "B" | "C" | "D";
  selected: "A" | "B" | "C" | "D";
  is_correct: boolean;
}

export interface Attempt {
  id: number | null;
  score: number;
  correct: number;
  total_questions: number;
  submitted_at: string;
  answers: ReviewAnswer[];
}

export interface Question extends QuizQuestion {
  correct_option: "A" | "B" | "C" | "D";
}

export interface Auth {
  username: string;
  token: string;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string> | undefined;

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty response */
  }
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; fields?: Record<string, string> };
    throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.fields);
  }
  return body as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  drawQuiz: (count: number) => request<{ items: QuizQuestion[] }>(`/api/quiz?count=${count}`),
  submitAttempt: (answers: { question_id: number; selected: string }[], token: string | null) =>
    request<Attempt>("/api/attempts", { method: "POST", body: JSON.stringify({ answers }) }, token),
  listAttempts: (token: string) => request<{ items: Attempt[] }>("/api/attempts", {}, token),
  getAttempt: (id: number, token: string) => request<Attempt>(`/api/attempts/${id}`, {}, token),
  addQuestion: (q: Record<string, string>, token: string) =>
    request<Question>("/api/admin/questions", { method: "POST", body: JSON.stringify(q) }, token),
  listQuestions: (token: string, page: number, pageSize: number) =>
    request<{ items: Question[]; total: number; page: number; page_size: number }>(
      `/api/admin/questions?page=${page}&page_size=${pageSize}`, {}, token),
};
