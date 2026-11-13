import type { Priority, Status, Task, TaskList, TaskValues } from "./types";

const TOKEN_KEY = "kanban.token";
const USER_KEY = "kanban.username";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function storeSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const obj = (body ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(
      res.status,
      obj.error ?? `Request failed with status ${res.status}`,
      obj.errors ?? {},
    );
  }
  return body as T;
}

export interface AuthResponse {
  id: number;
  username: string;
  token: string;
}

export const api = {
  register(username: string, password: string): Promise<AuthResponse> {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  login(username: string, password: string): Promise<{ token: string }> {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  me(): Promise<{ id: number; username: string }> {
    return request("/api/auth/me");
  },

  listTasks(priority?: Priority | null): Promise<TaskList> {
    const query = priority ? `?priority=${encodeURIComponent(priority)}` : "";
    return request(`/api/tasks${query}`);
  },

  createTask(values: TaskValues & { position?: number }): Promise<Task> {
    return request("/api/tasks", { method: "POST", body: JSON.stringify(values) });
  },

  updateTask(id: number, values: Partial<TaskValues & { position: number }>): Promise<Task> {
    return request(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(values) });
  },

  deleteTask(id: number): Promise<{ ok: boolean }> {
    return request(`/api/tasks/${id}`, { method: "DELETE" });
  },

  moveTask(id: number, status: Status, position: number): Promise<Task> {
    return request(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, position }),
    });
  },
};
