export type Preview = {
  id: number;
  url: string;
  final_url: string | null;
  status_code: number | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  fetched_at: string;
};

export type PreviewPage = {
  items: Preview[];
  total: number;
  page: number;
  page_size: number;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Network error", 0);
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<{ username: string }>("GET", "/me"),
  list: (page: number, pageSize: number) =>
    request<PreviewPage>("GET", `/previews?page=${page}&page_size=${pageSize}`),
  create: (url: string) => request<Preview>("POST", "/previews", { url }),
  refresh: (id: number) => request<Preview>("POST", `/previews/${id}/refresh`),
  remove: (id: number) => request<void>("DELETE", `/previews/${id}`),
};
