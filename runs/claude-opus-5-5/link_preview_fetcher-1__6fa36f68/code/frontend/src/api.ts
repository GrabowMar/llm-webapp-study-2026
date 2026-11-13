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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error. Please check your connection.");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`;
    if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username?: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  listPreviews: (page: number, pageSize: number) =>
    request<PreviewPage>(
      "GET",
      `/previews?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`,
    ),
  createPreview: (url: string) => request<Preview>("POST", "/previews", { url }),
  refreshPreview: (id: number) => request<Preview>("POST", `/previews/${id}/refresh`),
  deletePreview: (id: number) => request<void>("DELETE", `/previews/${id}`),
};
