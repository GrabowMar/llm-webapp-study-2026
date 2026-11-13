export interface Question {
  id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: string;
}

export interface AnswerReview {
  question_id: number;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  selected: string;
  is_correct: boolean;
}

export interface Attempt {
  id: number;
  score: number;
  correct: number;
  total_questions: number;
  submitted_at: string;
  answers: AnswerReview[];
}

const TOKEN_KEY = "quiz_token";
const USERNAME_KEY = "quiz_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setAuth(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: T = null as T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null as T;
  }

  return { ok: res.ok, status: res.status, data };
}

export async function register(username: string, password: string) {
  return request<{ id: number; username: string } | { error: string }>(
    "/api/auth/register",
    { method: "POST", body: { username, password } }
  );
}

export async function login(username: string, password: string) {
  return request<{ token: string; username: string } | { error: string }>(
    "/api/auth/login",
    { method: "POST", body: { username, password } }
  );
}

export async function fetchQuiz(count: number) {
  return request<{ items: Question[] }>(`/api/quiz?count=${count}`);
}

export async function submitAttempt(
  answers: { question_id: number; selected: string }[]
) {
  return request<Attempt>(`/api/attempts`, { method: "POST", body: { answers } });
}

export async function fetchAttempts() {
  return request<{ items: Attempt[] }>(`/api/attempts`);
}

export async function fetchAttempt(id: number) {
  return request<Attempt>(`/api/attempts/${id}`);
}

export async function adminAddQuestion(q: {
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
}) {
  return request<Question | { error: string }>(`/api/admin/questions`, {
    method: "POST",
    body: q,
  });
}

export async function adminListQuestions(page: number, pageSize: number) {
  return request<{ items: Question[]; total: number; page: number; page_size: number }>(
    `/api/admin/questions?page=${page}&page_size=${pageSize}`
  );
}
