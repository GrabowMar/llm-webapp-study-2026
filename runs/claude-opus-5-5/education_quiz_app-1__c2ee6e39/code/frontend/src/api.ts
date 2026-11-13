export type Option = "A" | "B" | "C" | "D";

export const OPTIONS: Option[] = ["A", "B", "C", "D"];

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
  active?: boolean;
}

export interface AttemptAnswer {
  question_id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
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
  answers: AttemptAnswer[];
  saved?: boolean;
}

export interface User {
  id?: number;
  username: string;
  is_admin: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "quiz_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function optionText(
  q: Pick<QuizQuestion, "option_a" | "option_b" | "option_c" | "option_d">,
  opt: Option,
): string {
  switch (opt) {
    case "A":
      return q.option_a;
    case "B":
      return q.option_b;
    case "C":
      return q.option_c;
    case "D":
      return q.option_d;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error. Please try again.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(res.status, d.error ?? `Request failed (${res.status})`, d.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<User>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string; is_admin: boolean }>("POST", "/auth/login", {
      username,
      password,
    }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<User>("GET", "/auth/me"),
  quiz: (count: number) =>
    request<{ items: QuizQuestion[] }>("GET", `/quiz?count=${encodeURIComponent(count)}`),
  submit: (answers: { question_id: number; selected: Option }[]) =>
    request<Attempt>("POST", "/attempts", { answers }),
  attempts: () => request<{ items: Attempt[] }>("GET", "/attempts"),
  attempt: (id: number) => request<Attempt>("GET", `/attempts/${id}`),
  createQuestion: (q: Omit<Question, "id" | "active">) =>
    request<Question>("POST", "/admin/questions", q),
  questions: (page: number, pageSize: number) =>
    request<Page<Question>>("GET", `/admin/questions?page=${page}&page_size=${pageSize}`),
};
