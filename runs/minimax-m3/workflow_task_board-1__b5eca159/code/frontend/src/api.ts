import type { AuthUser, Status, Task, TaskListResponse } from "./types";

const TOKEN_KEY = "kanban.token";
const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(message: string, status: number, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

let authToken: string | null = null;

try {
  authToken = window.localStorage.getItem(TOKEN_KEY);
} catch {
  authToken = null;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable - the session simply will not survive a reload */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach the server", 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const data = (payload ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(
      data.error || `Request failed (${response.status})`,
      response.status,
      data.errors ?? {},
    );
  }

  return (payload ?? ({} as unknown)) as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ user: AuthUser; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  login(username: string, password: string) {
    return request<{ user: AuthUser; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  me() {
    return request<{ user: AuthUser }>("/auth/me");
  },

  listTasks() {
    return request<TaskListResponse>("/tasks");
  },

  createTask(payload: {
    title: string;
    description?: string;
    status?: Status;
    priority?: string;
  }) {
    return request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateTask(id: number, payload: Partial<Omit<Task, "id" | "updated_at">>) {
    return request<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteTask(id: number) {
    return request<{ id: number; deleted: boolean }>(`/tasks/${id}`, { method: "DELETE" });
  },
};
