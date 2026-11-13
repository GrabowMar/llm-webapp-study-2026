export type Priority = "low" | "medium" | "high";

export interface Todo {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface TodoDraft {
  title?: string;
  description?: string | null;
  priority?: Priority;
  due_date?: string | null;
  completed?: boolean;
}

export interface TodoPage {
  items: Todo[];
  total: number;
  page: number;
  page_size: number;
  remaining: number;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

interface RequestOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the server", 0);
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    if (data && typeof data === "object" && "error" in data) {
      const detail = (data as { error: unknown }).error;
      if (typeof detail === "string" && detail) message = detail;
    }
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function register(username: string, password: string): Promise<void> {
  await request("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function listTodos(token: string, params: URLSearchParams): Promise<TodoPage> {
  const query = params.toString();
  return request<TodoPage>(`/api/todos${query ? `?${query}` : ""}`, { token });
}

export function createTodo(token: string, draft: TodoDraft): Promise<Todo> {
  return request<Todo>("/api/todos", { method: "POST", token, body: draft });
}

export function updateTodo(token: string, id: number, draft: TodoDraft): Promise<Todo> {
  return request<Todo>(`/api/todos/${id}`, { method: "PATCH", token, body: draft });
}

export function removeTodo(token: string, id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/todos/${id}`, {
    method: "DELETE",
    token,
  });
}
