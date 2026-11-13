export interface Notification {
  id: number;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export interface NotificationPage {
  items: Notification[];
  total: number;
  page: number;
  page_size: number;
  unread_count: number;
}

const TOKEN_KEY = "notif_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ username: string; is_admin: boolean }>("/auth/me"),
  list: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== "" && v !== undefined && v !== null) qs.set(k, String(v));
    }
    return request<NotificationPage>(`/notifications?${qs.toString()}`);
  },
  create: (message: string, type: string) =>
    request<Notification>("/notifications", {
      method: "POST",
      body: JSON.stringify({ message, type }),
    }),
  markAllRead: () =>
    request<{ updated: number }>("/notifications/read-all", { method: "POST" }),
  patch: (id: number, read: boolean) =>
    request<Notification>(`/notifications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ read }),
    }),
  remove: (id: number) =>
    request<void>(`/notifications/${id}`, { method: "DELETE" }),
  broadcast: (message: string, type: string) =>
    request<{ delivered: number }>("/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message, type }),
    }),
};
