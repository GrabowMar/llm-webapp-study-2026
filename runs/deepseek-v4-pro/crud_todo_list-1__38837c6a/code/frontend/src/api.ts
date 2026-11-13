export type Priority = "low" | "medium" | "high";

export interface Todo {
  id: number;
  title: string;
  description: string;
  priority: Priority;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface TodoListResponse {
  items: Todo[];
  total: number;
  page: number;
  page_size: number;
  remaining: number;
}

export interface TodoInput {
  title?: string;
  description?: string;
  priority?: Priority;
  due_date?: string | null;
  completed?: boolean;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "todo_token";
const USERNAME_KEY = "todo_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) {
    return undefined as T;
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export function apiRegister(username: string, password: string) {
  return request<{ id: number; username: string }>("POST", "/api/auth/register", {
    username,
    password,
  });
}

export function apiLogin(username: string, password: string) {
  return request<{ token: string }>("POST", "/api/auth/login", {
    username,
    password,
  });
}

export interface TodoQuery {
  completed?: boolean;
  priority?: Priority | "";
  page?: number;
  pageSize?: number;
}

export function apiListTodos(query: TodoQuery = {}) {
  const params = new URLSearchParams();
  if (query.completed !== undefined) {
    params.set("completed", String(query.completed));
  }
  if (query.priority) {
    params.set("priority", query.priority);
  }
  if (query.page !== undefined) {
    params.set("page", String(query.page));
  }
  if (query.pageSize !== undefined) {
    params.set("page_size", String(query.pageSize));
  }
  const qs = params.toString();
  return request<TodoListResponse>("GET", `/api/todos${qs ? `?${qs}` : ""}`);
}

export function apiCreateTodo(input: TodoInput) {
  return request<Todo>("POST", "/api/todos", input);
}

export function apiUpdateTodo(id: number, input: TodoInput) {
  return request<Todo>("PATCH", `/api/todos/${id}`, input);
}

export function apiDeleteTodo(id: number) {
  return request<void>("DELETE", `/api/todos/${id}`);
}
