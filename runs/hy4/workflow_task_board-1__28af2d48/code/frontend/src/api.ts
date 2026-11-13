export type Status = "todo" | "in_progress" | "done";
export type Priority = "low" | "medium" | "high";

export interface Task {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  position: number;
  updated_at: string;
}

export interface TaskList {
  items: Task[];
  total: number;
  counts: Record<Status, number>;
}

export interface ApiError extends Error {
  status: number;
  errors?: Record<string, string>;
}

const TOKEN_KEY = "kanban.token";
const USER_KEY = "kanban.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`/api${path}`, { ...options, headers, body: payload });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* empty response */
  }
  if (!response.ok) {
    const record = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    const error = new Error(record.error ?? `Request failed (${response.status})`) as ApiError;
    error.status = response.status;
    error.errors = record.errors;
    throw error;
  }
  return data as T;
}

export function errorMessages(error: unknown): string[] {
  if (error && typeof error === "object" && "errors" in error) {
    const errors = (error as ApiError).errors;
    if (errors && Object.keys(errors).length > 0) return Object.values(errors);
  }
  return [error instanceof Error ? error.message : "Something went wrong."];
}
