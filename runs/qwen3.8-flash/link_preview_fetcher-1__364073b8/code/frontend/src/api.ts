import type { Preview, PreviewPage } from "./types";

const TOKEN_KEY = "lp.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-json body */
  }
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") setToken(null);
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<void>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  listPreviews: (page: number, pageSize: number) =>
    request<PreviewPage>(`/previews?page=${page}&page_size=${pageSize}`),
  createPreview: (url: string) =>
    request<Preview>("/previews", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  refreshPreview: (id: number) =>
    request<Preview>(`/previews/${id}/refresh`, { method: "POST" }),
  deletePreview: (id: number) =>
    request<void>(`/previews/${id}`, { method: "DELETE" }),
};
