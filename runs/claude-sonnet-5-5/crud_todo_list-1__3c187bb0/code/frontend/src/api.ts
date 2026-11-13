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

export interface TodoInput {
  title?: string;
  description?: string | null;
  priority?: Priority;
  due_date?: string | null;
  completed?: boolean;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "todo_token";
let onUnauthorized: () => void = () => {};

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
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
    throw new ApiError("Network error, please try again", 0);
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  me: () => request<{ username: string }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),
  list: (opts: { completed?: boolean; priority?: Priority | ""; page: number; page_size: number }) => {
    const q = new URLSearchParams();
    if (opts.completed !== undefined) q.set("completed", String(opts.completed));
    if (opts.priority) q.set("priority", opts.priority);
    q.set("page", String(opts.page));
    q.set("page_size", String(opts.page_size));
    return request<TodoPage>("GET", `/todos?${q}`);
  },
  create: (input: TodoInput) => request<Todo>("POST", "/todos", input),
  update: (id: number, input: TodoInput) => request<Todo>("PATCH", `/todos/${id}`, input),
  remove: (id: number) => request<void>("DELETE", `/todos/${id}`),
};
