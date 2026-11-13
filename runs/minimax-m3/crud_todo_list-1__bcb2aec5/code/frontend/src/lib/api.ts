import type { ListParams, Todo, TodoInput, TodoPage } from "../types";

const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", 0);
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
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }

  return payload as T;
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const message = (payload as { error: unknown }).error;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return `Request failed with status ${status}`;
}

export type Credentials = { username: string; password: string };

export type AuthResult = { token: string; username: string };

export const api = {
  async register(credentials: Credentials): Promise<AuthResult> {
    const result = await request<{ token: string; username?: string }>("/auth/register", {
      method: "POST",
      body: credentials,
    });
    return { token: result.token, username: result.username ?? credentials.username.trim() };
  },

  async login(credentials: Credentials): Promise<AuthResult> {
    const result = await request<{ token: string }>("/auth/login", {
      method: "POST",
      body: credentials,
    });
    return { token: result.token, username: credentials.username.trim() };
  },

  async me(token: string): Promise<{ id: number; username: string }> {
    return request<{ id: number; username: string }>("/auth/me", { token });
  },

  async listTodos(token: string, params: ListParams): Promise<TodoPage> {
    const search = new URLSearchParams();
    if (params.completed !== undefined) {
      search.set("completed", params.completed ? "true" : "false");
    }
    if (params.priority) {
      search.set("priority", params.priority);
    }
    if (params.page !== undefined) {
      search.set("page", String(params.page));
    }
    if (params.page_size !== undefined) {
      search.set("page_size", String(params.page_size));
    }
    const query = search.toString();
    return request<TodoPage>(`/todos${query ? `?${query}` : ""}`, { token });
  },

  async createTodo(token: string, input: TodoInput): Promise<Todo> {
    return request<Todo>("/todos", { method: "POST", body: input, token });
  },

  async updateTodo(token: string, id: number, patch: TodoInput): Promise<Todo> {
    return request<Todo>(`/todos/${id}`, { method: "PATCH", body: patch, token });
  },

  async deleteTodo(token: string, id: number): Promise<void> {
    await request<{ status: string; id: number }>(`/todos/${id}`, { method: "DELETE", token });
  },
};
