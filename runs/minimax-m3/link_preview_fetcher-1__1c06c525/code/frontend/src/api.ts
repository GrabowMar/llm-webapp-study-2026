import type { Preview, PreviewPage, Session } from "./types";

const API_BASE = "/api";
const TOKEN_KEY = "linkpreviews.token";
const USERNAME_KEY = "linkpreviews.username";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function storedSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  return { token, username: localStorage.getItem(USERNAME_KEY) ?? "" };
}

export function saveSession(session: Session): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USERNAME_KEY, session.username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const token = "token" in options ? options.token : storedSession()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string; token: string }>("/auth/register", {
      method: "POST",
      body: { username, password },
      token: null,
    });
  },

  login(username: string, password: string) {
    return request<{ token: string; username: string; id: number }>("/auth/login", {
      method: "POST",
      body: { username, password },
      token: null,
    });
  },

  listPreviews(page: number, pageSize: number) {
    return request<PreviewPage>(`/previews?page=${page}&page_size=${pageSize}`);
  },

  createPreview(url: string) {
    return request<Preview>("/previews", { method: "POST", body: { url } });
  },

  refreshPreview(id: number) {
    return request<Preview>(`/previews/${id}/refresh`, { method: "POST" });
  },

  deletePreview(id: number) {
    return request<void>(`/previews/${id}`, { method: "DELETE" });
  },
};
