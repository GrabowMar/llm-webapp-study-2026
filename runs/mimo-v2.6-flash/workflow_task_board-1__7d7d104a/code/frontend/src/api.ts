export type Priority = "low" | "medium" | "high";
export type Status = "todo" | "in_progress" | "done";

export interface Task {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  position: number;
  updated_at: string;
}

export interface Counts {
  todo: number;
  in_progress: number;
  done: number;
}

export interface TaskListResponse {
  items: Task[];
  total: number;
  counts: Counts;
}

export interface User {
  id: number;
  username: string;
}

export class ApiError extends Error {
  status: number;
  errors: string[];

  constructor(status: number, message: string, errors?: string[]) {
    super(message);
    this.status = status;
    this.errors = errors && errors.length > 0 ? errors : [message];
  }
}

const TOKEN_KEY = "kanban_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage failures */
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const payload = data as { error?: unknown; errors?: unknown } | null;
    const message =
      payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status})`;
    const errors =
      payload && Array.isArray(payload.errors)
        ? payload.errors.filter((item): item is string => typeof item === "string")
        : undefined;
    throw new ApiError(response.status, message, errors);
  }

  return data as T;
}

export function register(username: string, password: string): Promise<User> {
  return request<User>("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export async function login(username: string, password: string): Promise<User> {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
  setToken(data.token);
  try {
    return await me();
  } catch (error) {
    setToken(null);
    throw error;
  }
}

export function me(): Promise<User> {
  return request<User>("/api/auth/me");
}

export function logout(): Promise<unknown> {
  return request<unknown>("/api/auth/logout", { method: "POST" });
}

export function listTasks(priority?: Priority): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (priority) params.set("priority", priority);
  const query = params.toString();
  return request<TaskListResponse>(`/api/tasks${query ? `?${query}` : ""}`);
}

export function createTask(body: {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
}): Promise<Task> {
  return request<Task>("/api/tasks", { method: "POST", body });
}

export function updateTask(id: number, body: Record<string, unknown>): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`, { method: "PATCH", body });
}

export function deleteTask(id: number): Promise<unknown> {
  return request<unknown>(`/api/tasks/${id}`, { method: "DELETE" });
}
