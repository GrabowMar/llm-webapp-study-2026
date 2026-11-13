export const STATUSES = ["todo", "in_progress", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

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

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }

  fieldErrors(): Record<string, string> {
    return this.errors;
  }
}

const TOKEN_KEY = "kanban_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`/api${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    const body = (data ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(
      response.status,
      body.error ?? `Request failed with status ${response.status}`,
      body.errors ?? {}
    );
  }
  return data as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  login(username: string, password: string) {
    return request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  me() {
    return request<{ username: string }>("/auth/me");
  },
  listTasks(params: { status?: Status; priority?: Priority } = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.priority) query.set("priority", params.priority);
    const suffix = query.toString();
    return request<TaskList>(`/tasks${suffix ? `?${suffix}` : ""}`);
  },
  createTask(input: TaskInput) {
    return request<Task>("/tasks", { method: "POST", body: JSON.stringify(input) });
  },
  updateTask(id: number, input: TaskInput) {
    return request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  deleteTask(id: number) {
    return request<void>(`/tasks/${id}`, { method: "DELETE" });
  },
};
