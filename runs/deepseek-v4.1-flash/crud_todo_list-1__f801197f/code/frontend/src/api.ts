const TOKEN_KEY = "todo_token";

let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function getStoredToken(): string | null {
  return authToken;
}

export function setStoredToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Todo {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface TodoPage {
  items: Todo[];
  total: number;
  page: number;
  page_size: number;
  remaining: number;
}

export interface TodoInput {
  title?: string;
  description?: string | null;
  priority?: string;
  due_date?: string | null;
  completed?: boolean;
}

export interface ListParams {
  completed?: boolean;
  priority?: string;
  page?: number;
  page_size?: number;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`/api${path}`, { ...options, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  let data: unknown = null;
  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok) {
    const body = (data ?? {}) as {
      error?: string;
      errors?: Record<string, string>;
    };
    throw new ApiError(
      body.error ?? `Request failed (${response.status})`,
      response.status,
      body.errors ?? {},
    );
  }

  return data as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function register(username: string, password: string): Promise<User> {
  return request<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function me(): Promise<User> {
  return request<User>("/auth/me");
}

export function logout(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" });
}

export function listTodos(params: ListParams = {}): Promise<TodoPage> {
  return request<TodoPage>(
    `/todos${query({
      completed: params.completed,
      priority: params.priority,
      page: params.page,
      page_size: params.page_size,
    })}`,
  );
}

export function createTodo(input: TodoInput): Promise<Todo> {
  return request<Todo>("/todos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTodo(id: number, input: TodoInput): Promise<Todo> {
  return request<Todo>(`/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTodo(id: number): Promise<void> {
  return request<void>(`/todos/${id}`, { method: "DELETE" });
}
