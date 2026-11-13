export interface Link {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
  short_url: string;
  owner: string;
  is_active: boolean;
}

export interface PagedLinks {
  items: Link[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  login(username: string, password: string) {
    return request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  createLink(url: string, token: string) {
    return request<Link>(
      "/api/links",
      { method: "POST", body: JSON.stringify({ url }) },
      token,
    );
  },

  listLinks(page: number, pageSize: number) {
    return request<PagedLinks>(`/api/links?page=${page}&page_size=${pageSize}`);
  },

  deleteLink(id: number, token: string) {
    return request<void>(`/api/links/${id}`, { method: "DELETE" }, token);
  },

  adminListLinks(page: number, pageSize: number, token: string) {
    return request<PagedLinks>(
      `/api/admin/links?page=${page}&page_size=${pageSize}`,
      {},
      token,
    );
  },

  adminToggleLink(id: number, token: string) {
    return request<Link>(
      `/api/admin/links/${id}/toggle`,
      { method: "POST" },
      token,
    );
  },
};

export function shortAddress(link: Pick<Link, "short_url">): string {
  return `${window.location.origin}${link.short_url}`;
}
