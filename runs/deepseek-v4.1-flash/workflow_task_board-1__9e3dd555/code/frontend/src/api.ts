export type Status = "todo" | "in_progress" | "done";

export interface Task {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: string;
  position: number;
  updated_at: string;
}

export interface TaskList {
  items: Task[];
  total: number;
  counts: Record<Status, number>;
}

export interface Session {
  token: string;
  username: string;
}

export interface TaskInput {
  title: string;
  description: string;
  status: Status;
  priority: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", 0);
  }

  if (response.status === 204) {
    return undefined as T;
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
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export function register(
  username: string,
  password: string,
): Promise<{ id: number; username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(
  username: string,
  password: string,
): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function fetchTasks(): Promise<TaskList> {
  return request("/api/tasks");
}

export function createTask(
  input: TaskInput,
  token: string,
): Promise<Task> {
  return request(
    "/api/tasks",
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
}

export function updateTask(
  id: number,
  input: Partial<TaskInput> & { position?: number },
  token: string,
): Promise<Task> {
  return request(
    `/api/tasks/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    token,
  );
}

export function deleteTask(id: number, token: string): Promise<void> {
  return request(`/api/tasks/${id}`, { method: "DELETE" }, token);
}
