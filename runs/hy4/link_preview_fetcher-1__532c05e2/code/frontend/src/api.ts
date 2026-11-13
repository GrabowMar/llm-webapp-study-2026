export interface Preview {
  id: number;
  url: string;
  final_url: string | null;
  status_code: number | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  fetched_at: string;
}

export interface Page {
  items: Preview[];
  total: number;
  page: number;
  page_size: number;
}

const TOKEN_KEY = "linkpreviews.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach the server", 0);
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export const apiClient = {
  register(username: string, password: string) {
    return api<{ id: number; username: string }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false,
    );
  },

  async login(username: string, password: string): Promise<string> {
    const result = await api<{ token: string }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false,
    );
    return result.token;
  },

  me() {
    return api<{ id: number; username: string }>("/auth/me");
  },

  logout() {
    return api<{ status: string }>("/auth/logout", { method: "POST" });
  },

  addPreview(url: string) {
    return api<Preview>("/previews", { method: "POST", body: JSON.stringify({ url }) });
  },

  listPreviews(page: number, pageSize: number) {
    return api<Page>(`/previews?page=${page}&page_size=${pageSize}`);
  },

  refreshPreview(id: number) {
    return api<Preview>(`/previews/${id}/refresh`, { method: "POST" });
  },

  deletePreview(id: number) {
    return api<null>(`/previews/${id}`, { method: "DELETE" });
  },
};
