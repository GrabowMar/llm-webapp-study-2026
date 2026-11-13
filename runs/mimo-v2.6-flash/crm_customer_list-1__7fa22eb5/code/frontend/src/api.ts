const TOKEN_KEY = "directory_token";
const USERNAME_KEY = "directory_username";

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type ApiOptions = {
  method?: string;
  body?: unknown;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) return undefined as T;

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
    const record = (data ?? {}) as Record<string, unknown>;
    const fieldErrors: Record<string, string> = {};
    if (record.errors && typeof record.errors === "object") {
      for (const [field, message] of Object.entries(record.errors as Record<string, unknown>)) {
        if (typeof message === "string") fieldErrors[field] = message;
      }
    }
    let message =
      typeof record.error === "string" ? record.error : `Request failed (${response.status})`;
    if (Object.keys(fieldErrors).length > 0 && !record.error) {
      message = Object.values(fieldErrors)[0];
    }
    if (response.status === 401 && !path.startsWith("/api/auth/") && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(response.status, message, fieldErrors);
  }

  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
