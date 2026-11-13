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

export type User = {
  id: number;
  username: string;
  is_admin: boolean;
};

const TOKEN_KEY = "notification_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`/api${path}`, { ...options, headers });
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
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const api = {
  register(username: string, password: string) {
    return request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  async login(username: string, password: string) {
    const result = await request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(result.token);
    return result;
  },
  me() {
    return request<User>("/auth/me");
  },
  listNotifications(params: {
    read?: string;
    type?: string;
    page: number;
    pageSize: number;
  }) {
    const search = new URLSearchParams();
    if (params.read && params.read !== "all") {
      search.set("read", params.read);
    }
    const type = params.type?.trim();
    if (type) {
      search.set("type", type);
    }
    search.set("page", String(params.page));
    search.set("page_size", String(params.pageSize));
    return request<NotificationPage>(`/notifications?${search.toString()}`);
  },
  createNotification(message: string, type: string) {
    return request<Notification>("/notifications", {
      method: "POST",
      body: JSON.stringify({ message, type }),
    });
  },
  readAll() {
    return request<{ updated: number }>("/notifications/read-all", {
      method: "POST",
    });
  },
  setRead(id: number, read: boolean) {
    return request<Notification>(`/notifications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ read }),
    });
  },
  deleteNotification(id: number) {
    return request<{ deleted: boolean; id: number }>(`/notifications/${id}`, {
      method: "DELETE",
    });
  },
  broadcast(message: string, type: string) {
    return request<{ delivered: number }>("/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message, type }),
    });
  },
};
