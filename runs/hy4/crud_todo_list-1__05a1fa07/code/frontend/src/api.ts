import type { Todo, TodoInput, TodoPage } from "./types";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

let token: string | null = localStorage.getItem("todo_token");
let username: string | null = localStorage.getItem("todo_username");

export const getToken = () => token;
export const getUsername = () => username;

export function setSession(newToken: string | null, newUsername: string | null) {
  token = newToken;
  username = newUsername;
  if (newToken && newUsername) {
    localStorage.setItem("todo_token", newToken);
    localStorage.setItem("todo_username", newUsername);
  } else {
    localStorage.removeItem("todo_token");
    localStorage.removeItem("todo_username");
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  const rawErrors = body.errors;
  const errors: Record<string, string> = {};
  if (rawErrors && typeof rawErrors === "object") {
    for (const [key, value] of Object.entries(rawErrors)) {
      errors[key] = Array.isArray(value) ? value.join(" ") : String(value);
    }
  }
  const message =
    (typeof body.message === "string" && body.message) ||
    (typeof body.error === "string" && body.error) ||
    `Request failed (${response.status})`;
  return new ApiError(response.status, message, errors);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { ...init, headers });
  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event("todo:unauthorized"));
    }
    throw await parseError(response);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function register(name: string, password: string): Promise<void> {
  await request<unknown>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: name, password }),
  });
  await login(name, password);
}

export async function login(name: string, password: string): Promise<void> {
  const result = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: name, password }),
  });
  setSession(result.token, name);
}

export function logout(): void {
  setSession(null, null);
}

export interface ListParams {
  completed?: boolean;
  priority?: string;
  page: number;
  page_size: number;
}

export function listTodos(params: ListParams): Promise<TodoPage> {
  const search = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.page_size),
  });
  if (params.completed !== undefined) search.set("completed", String(params.completed));
  if (params.priority) search.set("priority", params.priority);
  return request<TodoPage>(`/todos?${search.toString()}`);
}

export function createTodo(input: TodoInput): Promise<Todo> {
  return request<Todo>("/todos", { method: "POST", body: JSON.stringify(input) });
}

export function patchTodo(id: number, changes: Partial<TodoInput> & { completed?: boolean }): Promise<Todo> {
  return request<Todo>(`/todos/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export function deleteTodo(id: number): Promise<void> {
  return request<void>(`/todos/${id}`, { method: "DELETE" });
}
