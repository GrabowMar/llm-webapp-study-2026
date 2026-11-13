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

export interface TodoPage {
  items: Todo[];
  total: number;
  page: number;
  page_size: number;
  remaining: number;
}

export type TodoInput = Partial<
  Pick<Todo, "title" | "description" | "priority" | "due_date" | "completed">
>;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "todoapp.token";
const USER_KEY = "todoapp.username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setToken(token: string | null, username?: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (token && username) localStorage.setItem(USER_KEY, username);
  if (!token) localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    const record = (body ?? {}) as Record<string, unknown>;
    const message =
      typeof record.error === "string"
        ? record.error
        : typeof record.message === "string"
          ? record.message
          : `Request failed with status ${res.status}.`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export function register(username: string, password: string) {
  return request<{ message: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string) {
  const data = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token, username);
  return data;
}

export async function logout() {
  try {
    await request("/auth/logout", { method: "POST" });
  } catch {
    /* ignore network errors on logout */
  }
  setToken(null);
}

export function fetchTodos(params: {
  completed?: boolean;
  priority?: Priority;
  page: number;
  page_size: number;
}) {
  const q = new URLSearchParams();
  if (params.completed !== undefined)
    q.set("completed", String(params.completed));
  if (params.priority) q.set("priority", params.priority);
  q.set("page", String(params.page));
  q.set("page_size", String(params.page_size));
  return request<TodoPage>(`/todos?${q.toString()}`);
}

export function createTodo(input: TodoInput) {
  return request<Todo>("/todos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchTodo(id: number, input: TodoInput) {
  return request<Todo>(`/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTodo(id: number) {
  return request<void>(`/todos/${id}`, { method: "DELETE" });
}
