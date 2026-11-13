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

export type Me = { id: number; username: string; is_admin: boolean };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "nc_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<Me>("GET", "/auth/me"),
  list: (params: { read?: string; type?: string; page: number; page_size: number }) => {
    const q = new URLSearchParams();
    if (params.read) q.set("read", params.read);
    if (params.type) q.set("type", params.type);
    q.set("page", String(params.page));
    q.set("page_size", String(params.page_size));
    return request<NotificationPage>("GET", `/notifications?${q.toString()}`);
  },
  create: (message: string, type: string) =>
    request<Notification>("POST", "/notifications", { message, type }),
  setRead: (id: number, read: boolean) =>
    request<Notification>("PATCH", `/notifications/${id}`, { read }),
  remove: (id: number) => request<void>("DELETE", `/notifications/${id}`),
  readAll: () => request<{ updated: number }>("POST", "/notifications/read-all"),
  broadcast: (message: string, type: string) =>
    request<{ delivered: number }>("POST", "/admin/broadcast", { message, type }),
};
