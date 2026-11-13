import type { Account, Session, Transfer, TransferPage } from "./types";

const TOKEN_KEY = "bank.token";
const CSRF_KEY = "bank.csrf";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function storedToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeSession(token: string, csrfToken?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (csrfToken) {
    localStorage.setItem(CSRF_KEY, csrfToken);
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CSRF_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = storedToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const csrfToken = localStorage.getItem(CSRF_KEY);
  if (csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", 0);
  }

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
    const body = payload as { error?: string; message?: string } | null;
    const message =
      body?.error ||
      body?.message ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export function registerUser(
  username: string,
  password: string,
): Promise<Session & { balance: number }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function loginUser(username: string, password: string): Promise<Session> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logoutUser(): Promise<{ ok: boolean }> {
  return request("/api/auth/logout", { method: "POST" });
}

export async function fetchCsrfToken(): Promise<string> {
  const data = await request<{ csrf_token: string }>("/api/auth/csrf");
  if (data.csrf_token) {
    localStorage.setItem(CSRF_KEY, data.csrf_token);
  }
  return data.csrf_token;
}

export function fetchAccount(): Promise<Account> {
  return request<Account>("/api/account");
}

export interface NewTransfer {
  to_username: string;
  amount: number;
  memo?: string;
}

export function createTransfer(transfer: NewTransfer): Promise<Transfer> {
  return request<Transfer>("/api/transfers", {
    method: "POST",
    body: JSON.stringify({
      to_username: transfer.to_username,
      amount: transfer.amount,
      memo: transfer.memo ?? "",
    }),
  });
}

export function fetchTransfers(
  page: number,
  pageSize: number,
): Promise<TransferPage> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  return request<TransferPage>(`/api/transfers?${query.toString()}`);
}

export function fetchTransfer(id: number): Promise<Transfer> {
  return request<Transfer>(`/api/transfers/${id}`);
}
