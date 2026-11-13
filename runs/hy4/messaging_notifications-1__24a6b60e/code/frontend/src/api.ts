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

export interface ListParams {
  read?: string;
  type?: string;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach the server", 0);
  }

  let payload: unknown = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(detail, response.status);
  }
  return payload as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify({ username, password }) },
    ),
  login: (username: string, password: string) =>
    request<{ token: string }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
    ),
  logout: (token: string) =>
    request<{ status: string }>("/auth/logout", { method: "POST" }, token),
  list: (params: ListParams, token: string) => {
    const query = new URLSearchParams({
      page: String(params.page),
      page_size: String(params.page_size),
    });
    if (params.read) query.set("read", params.read);
    if (params.type) query.set("type", params.type);
    return request<NotificationPage>(`/notifications?${query.toString()}`, {}, token);
  },
  create: (message: string, type: string, token: string) =>
    request<Notification>(
      "/notifications",
      { method: "POST", body: JSON.stringify({ message, type }) },
      token,
    ),
  readAll: (token: string) =>
    request<{ updated: number }>("/notifications/read-all", { method: "POST" }, token),
  patch: (id: number, read: boolean, token: string) =>
    request<Notification>(
      `/notifications/${id}`,
      { method: "PATCH", body: JSON.stringify({ read }) },
      token,
    ),
  remove: (id: number, token: string) =>
    request<{ deleted: boolean; id: number }>(
      `/notifications/${id}`,
      { method: "DELETE" },
      token,
    ),
  broadcast: (message: string, type: string, token: string) =>
    request<{ delivered: number }>(
      "/admin/broadcast",
      { method: "POST", body: JSON.stringify({ message, type }) },
      token,
    ),
};
