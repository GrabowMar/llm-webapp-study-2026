import type { Priority, Todo, TodoInput, TodoPage } from "./types";

const TOKEN_KEY = "todo.token";
const USERNAME_KEY = "todo.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export class ApiError extends Error {
  fields: Record<string, string>;
  status: number;

  constructor(message: string, fields: Record<string, string>, status: number) {
    super(message);
    this.name = "ApiError";
    this.fields = fields;
    this.status = status;
  }
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError("Could not reach the server. Please try again.", {}, 0);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    throw new ApiError(
      typeof payload.error === "string" ? payload.error : `Request failed (status ${res.status})`,
      payload.fields ?? {},
      res.status,
    );
  }
  return data as T;
}

export interface ListParams {
  completed?: boolean;
  priority?: Priority | "";
  page: number;
  pageSize: number;
}

export async function listTodos(params: ListParams): Promise<TodoPage> {
  const query = new URLSearchParams();
  if (params.completed !== undefined) query.set("completed", String(params.completed));
  if (params.priority) query.set("priority", params.priority);
  query.set("page", String(params.page));
  query.set("page_size", String(params.pageSize));
  return request<TodoPage>(`/api/todos?${query.toString()}`);
}

export async function createTodo(input: TodoInput): Promise<Todo> {
  return request<Todo>("/api/todos", { method: "POST", body: input });
}

export async function updateTodo(
  id: number,
  patch: Partial<TodoInput> & { completed?: boolean },
): Promise<Todo> {
  return request<Todo>(`/api/todos/${id}`, { method: "PATCH", body: patch });
}

export async function deleteTodo(id: number): Promise<void> {
  await request<void>(`/api/todos/${id}`, { method: "DELETE" });
}

export async function register(username: string, password: string): Promise<{ username: string }> {
  return request("/api/auth/register", { method: "POST", body: { username, password } });
}

export async function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", { method: "POST", body: { username, password } });
}

export { toApiError };
