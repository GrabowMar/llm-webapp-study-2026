export type Priority = "low" | "medium" | "high";

export const PRIORITIES: Priority[] = ["low", "medium", "high"];

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
  priority?: Priority;
  due_date?: string | null;
  completed?: boolean;
}

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  status: number;
  errors: FieldErrors;

  constructor(status: number, message: string, errors: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "todo.token";
const USERNAME_KEY = "todo.username";

export interface Session {
  token: string;
  username: string;
}

export function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  return token && username ? { token, username } : null;
}

export function saveSession(session: Session | null) {
  if (session) {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(USERNAME_KEY, session.username);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const session = loadSession();
  if (auth && session) headers["Authorization"] = `Bearer ${session.token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && auth) unauthorizedHandler?.();
    const message = (data && typeof data.error === "string" && data.error) || `Request failed (${response.status}).`;
    throw new ApiError(response.status, message, (data && data.errors) || {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }, false),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }, false),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  listTodos: (params: { completed?: boolean; priority?: Priority; page: number; page_size: number }) => {
    const query = new URLSearchParams();
    if (params.completed !== undefined) query.set("completed", String(params.completed));
    if (params.priority) query.set("priority", params.priority);
    query.set("page", String(params.page));
    query.set("page_size", String(params.page_size));
    return request<TodoPage>("GET", `/todos?${query}`);
  },
  createTodo: (input: TodoInput) => request<Todo>("POST", "/todos", input),
  updateTodo: (id: number, input: TodoInput) => request<Todo>("PATCH", `/todos/${id}`, input),
  deleteTodo: (id: number) => request<void>("DELETE", `/todos/${id}`),
};
