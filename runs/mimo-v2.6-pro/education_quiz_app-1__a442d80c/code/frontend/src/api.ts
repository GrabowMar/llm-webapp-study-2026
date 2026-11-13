import type { AnswerInput, Attempt, NewQuestion, QuestionPage } from "./types";

const TOKEN_KEY = "quiz_token";
const USERNAME_KEY = "quiz_username";

export interface Session {
  token: string;
  username: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function loadSession(): Session | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USERNAME_KEY);
    if (token && username) {
      return { token, username };
    }
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(USERNAME_KEY, session.username);
  } catch {
    /* storage unavailable */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const session = loadSession();
  if (session) {
    headers["Authorization"] = `Bearer ${session.token}`;
  }
  const res = await fetch(path, { ...init, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? ((body as { error: string }).error)
        : `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export function register(username: string, password: string): Promise<{ id: number; username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function fetchQuiz(count: number): Promise<{ items: import("./types").QuizQuestion[] }> {
  return request(`/api/quiz?count=${count}`);
}

export function submitAttempt(answers: AnswerInput[]): Promise<Attempt> {
  return request("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export function fetchAttempts(): Promise<{ items: Attempt[] }> {
  return request("/api/attempts");
}

export function fetchAttempt(id: number): Promise<Attempt> {
  return request(`/api/attempts/${id}`);
}

export function createQuestion(payload: NewQuestion): Promise<import("./types").Question> {
  return request("/api/admin/questions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchQuestions(page: number, pageSize: number): Promise<QuestionPage> {
  return request(`/api/admin/questions?page=${page}&page_size=${pageSize}`);
}
