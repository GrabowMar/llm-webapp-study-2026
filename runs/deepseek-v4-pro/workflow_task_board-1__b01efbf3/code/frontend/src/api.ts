import type { Task, TaskList } from "./types";

export class ApiError extends Error {
  status: number;
  details: Record<string, string>;

  constructor(status: number, message: string, details: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function bearer(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    let message = "Request failed";
    let details: Record<string, string> = {};
    if (typeof body === "object" && body !== null) {
      if (typeof body.error === "string") message = body.error;
      if (body.errors && typeof body.errors === "object") details = body.errors;
    }
    throw new ApiError(res.status, message, details);
  }
  return body as T;
}

export interface Api {
  register(username: string, password: string): Promise<{ username: string }>;
  login(username: string, password: string): Promise<{ token: string; username: string }>;
  listTasks(params?: { status?: string; priority?: string }): Promise<TaskList>;
  getTask(id: number): Promise<Task>;
  createTask(data: TaskInput): Promise<Task>;
  updateTask(id: number, data: Partial<TaskInput>): Promise<Task>;
  deleteTask(id: number): Promise<void>;
}

export interface TaskInput {
  title: string;
  description: string;
  status: string;
  priority: string;
  position?: number;
}

export function createApi(token: string | null): Api {
  const base = "/api";

  return {
    register: (username, password) =>
      fetch(`${base}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }).then((r) => handle(r)),

    login: (username, password) =>
      fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }).then((r) => handle(r)),

    listTasks: (params) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.priority) qs.set("priority", params.priority);
      const suffix = qs.toString() ? `?${qs}` : "";
      return fetch(`${base}/tasks${suffix}`, { headers: bearer(token) }).then((r) =>
        handle(r),
      );
    },

    getTask: (id) =>
      fetch(`${base}/tasks/${id}`, { headers: bearer(token) }).then((r) => handle(r)),

    createTask: (data) =>
      fetch(`${base}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...bearer(token) },
        body: JSON.stringify(data),
      }).then((r) => handle(r)),

    updateTask: (id, data) =>
      fetch(`${base}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...bearer(token) },
        body: JSON.stringify(data),
      }).then((r) => handle(r)),

    deleteTask: (id) =>
      fetch(`${base}/tasks/${id}`, {
        method: "DELETE",
        headers: bearer(token),
      }).then((r) => handle(r)),
  };
}
