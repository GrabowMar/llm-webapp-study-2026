import type {
  AuthUser,
  ConversionPage,
  Direction,
  SavedConversion,
} from "./types";

const TOKEN_KEY = "base64.token";
const USERNAME_KEY = "base64.username";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function storedToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function storedUsername(): string | null {
  return window.localStorage.getItem(USERNAME_KEY);
}

export function storeSession(token: string, username: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("The server could not be reached", 0);
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
    const data = payload as { error?: string; message?: string } | null;
    const message =
      data?.error ?? data?.message ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function register(
  username: string,
  password: string,
): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return request<{ token: string; username: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function me(token: string): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/me", { headers: authHeaders(token) });
}

export async function encode(text: string): Promise<string> {
  const data = await request<{ encoded: string }>("/api/base64/encode", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return data.encoded;
}

export async function decode(encoded: string): Promise<string> {
  const data = await request<{ text: string }>("/api/base64/decode", {
    method: "POST",
    body: JSON.stringify({ encoded }),
  });
  return data.text;
}

export async function saveConversion(
  token: string,
  direction: Direction,
  input: string,
): Promise<SavedConversion> {
  return request<SavedConversion>("/api/conversions", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ direction, input }),
  });
}

export async function listConversions(
  token: string,
  page: number,
  pageSize: number,
): Promise<ConversionPage> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  return request<ConversionPage>(`/api/conversions?${query.toString()}`, {
    headers: authHeaders(token),
  });
}

export async function deleteConversion(
  token: string,
  id: number,
): Promise<void> {
  await request<null>(`/api/conversions/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}
