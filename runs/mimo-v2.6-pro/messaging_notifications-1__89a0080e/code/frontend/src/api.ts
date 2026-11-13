export type Notification = {
  id: number;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
};

export type NotificationPage = {
  items: Notification[];
  total: number;
  page: number;
  page_size: number;
  unread_count: number;
};

const TOKEN_KEY = "notification_center_token";
const USERNAME_KEY = "notification_center_username";

export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message =
      data && typeof data.error === "string"
        ? data.error
        : res.statusText || `request failed (${res.status})`;
    throw new HttpError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function register(username: string, password: string) {
  return request<{ id: number; username: string }>("POST", "/api/auth/register", {
    username,
    password,
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("POST", "/api/auth/login", { username, password });
}

export function listNotifications(params: {
  read: string;
  type: string;
  page: number;
  pageSize: number;
}): Promise<NotificationPage> {
  const query = new URLSearchParams();
  if (params.read) query.set("read", params.read);
  if (params.type) query.set("type", params.type);
  query.set("page", String(params.page));
  query.set("page_size", String(params.pageSize));
  return request("GET", `/api/notifications?${query.toString()}`);
}

export function createNotification(message: string, type: string) {
  return request<Notification>("POST", "/api/notifications", { message, type });
}

export function markAllRead() {
  return request<{ updated: number }>("POST", "/api/notifications/read-all");
}

export function setRead(id: number, read: boolean) {
  return request<Notification>("PATCH", `/api/notifications/${id}`, { read });
}

export function deleteNotification(id: number) {
  return request<void>("DELETE", `/api/notifications/${id}`);
}

export function broadcast(message: string, type: string) {
  return request<{ delivered: number }>("POST", "/api/admin/broadcast", { message, type });
}
