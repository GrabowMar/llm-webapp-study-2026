import type { ListResponse, Notification } from "./types";

const TOKEN_KEY = "token";
const USER_KEY = "username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    window.location.reload();
    throw new Error("unauthorized");
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `error ${res.status}`);
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request<{ token: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listNotifications(params: {
  read?: string;
  type?: string;
  page: number;
  page_size: number;
}) {
  const q = new URLSearchParams();
  if (params.read) q.set("read", params.read);
  if (params.type) q.set("type", params.type);
  q.set("page", String(params.page));
  q.set("page_size", String(params.page_size));
  return request<ListResponse>(`/api/notifications?${q.toString()}`);
}

export function createNotification(message: string, type: string) {
  return request<Notification>("/api/notifications", {
    method: "POST",
    body: JSON.stringify({ message, type }),
  });
}

export function readAll() {
  return request<{ updated: number }>("/api/notifications/read-all", {
    method: "POST",
  });
}

export function updateNotification(id: number, read: boolean) {
  return request<Notification>(`/api/notifications/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
  });
}

export function deleteNotification(id: number) {
  return request<void>(`/api/notifications/${id}`, { method: "DELETE" });
}

export function broadcast(message: string, type: string) {
  return request<{ delivered: number }>("/api/admin/broadcast", {
    method: "POST",
    body: JSON.stringify({ message, type }),
  });
}
