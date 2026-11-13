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

export interface TaskInput {
  title?: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  position?: number;
}

export const STATUSES: { key: Status; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

export const PRIORITIES: { key: Priority; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "kanban.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

const USER_KEY = "kanban.username";

export function getStoredUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setToken(token: string | null, username: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (token && username) localStorage.setItem(USER_KEY, username);
  else localStorage.removeItem(USER_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error. Please check your connection.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(res.status, d.error ?? `Request failed (${res.status}).`, d.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string; token: string }>("POST", "/auth/register", {
      username,
      password,
    }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("POST", "/auth/login", { username, password }),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),
  listTasks: (priority?: Priority | "") =>
    request<TaskList>("GET", `/tasks${priority ? `?priority=${encodeURIComponent(priority)}` : ""}`),
  createTask: (input: TaskInput) => request<Task>("POST", "/tasks", input),
  updateTask: (id: number, input: TaskInput) => request<Task>("PATCH", `/tasks/${id}`, input),
  deleteTask: (id: number) => request<void>("DELETE", `/tasks/${id}`),
};
