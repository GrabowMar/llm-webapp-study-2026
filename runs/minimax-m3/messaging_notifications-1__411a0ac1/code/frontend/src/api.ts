import type { Notification, NotificationPage, ReadFilter, Session, User } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return data as T;
}

export async function register(username: string, password: string): Promise<Session> {
  const data = await request<{ token: string; user: User }>("/auth/register", {
    method: "POST",
    body: { username, password },
  });
  return { token: data.token, user: data.user };
}

export async function login(username: string, password: string): Promise<Session> {
  const data = await request<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: { username, password },
  });
  return { token: data.token, user: data.user };
}

export async function fetchMe(token: string): Promise<User> {
  const data = await request<{ user: User }>("/auth/me", { token });
  return data.user;
}

export async function fetchNotifications(
  token: string,
  filters: { read: ReadFilter; type: string; page: number; pageSize: number },
): Promise<NotificationPage> {
  const params = new URLSearchParams();
  if (filters.read === "read") params.set("read", "true");
  if (filters.read === "unread") params.set("read", "false");
  if (filters.type) params.set("type", filters.type);
  params.set("page", String(filters.page));
  params.set("page_size", String(filters.pageSize));
  const query = params.toString();
  return request<NotificationPage>(`/notifications?${query}`, { token });
}

export async function fetchTypes(token: string): Promise<string[]> {
  const data = await request<{ types: string[] }>("/notifications/types", { token });
  return data.types;
}

export async function createNotification(
  token: string,
  message: string,
  type: string,
): Promise<Notification> {
  return request<Notification>("/notifications", {
    method: "POST",
    token,
    body: { message, type },
  });
}

export async function setNotificationRead(
  token: string,
  id: number,
  read: boolean,
): Promise<Notification> {
  return request<Notification>(`/notifications/${id}`, {
    method: "PATCH",
    token,
    body: { read },
  });
}

export async function deleteNotification(token: string, id: number): Promise<void> {
  await request<void>(`/notifications/${id}`, { method: "DELETE", token });
}

export async function markAllRead(token: string): Promise<number> {
  const data = await request<{ updated: number }>("/notifications/read-all", {
    method: "POST",
    token,
  });
  return data.updated;
}

export async function broadcast(token: string, message: string, type: string): Promise<number> {
  const data = await request<{ delivered: number }>("/admin/broadcast", {
    method: "POST",
    token,
    body: { message, type },
  });
  return data.delivered;
}
