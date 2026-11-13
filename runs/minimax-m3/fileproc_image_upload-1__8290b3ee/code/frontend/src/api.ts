import type { AuthenticatedUser, ImageItem, ImagePage } from "./types";

const API_BASE = "/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError("Could not reach the server.", 0);
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as { error?: string; message?: string } | null;
    const message =
      body?.error ?? body?.message ?? `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export function register(username: string, password: string): Promise<AuthenticatedUser> {
  return request<AuthenticatedUser>("/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export async function login(username: string, password: string): Promise<string> {
  const result = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: { username, password },
  });
  return result.token;
}

export function fetchMe(token: string): Promise<AuthenticatedUser> {
  return request<AuthenticatedUser>("/auth/me", { token });
}

export function fetchImages(
  page: number,
  pageSize: number,
  token?: string | null,
): Promise<ImagePage> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  return request<ImagePage>(`/images?${query.toString()}`, { token });
}

export function uploadImage(
  token: string,
  payload: { filename: string; data: string; title?: string },
): Promise<ImageItem> {
  return request<ImageItem>("/images", { method: "POST", body: payload, token });
}

export function deleteImage(token: string, id: number): Promise<{ id: number }> {
  return request<{ id: number }>(`/images/${id}`, { method: "DELETE", token });
}
