export type Transfer = {
  id: number;
  from_username: string;
  to_username: string;
  amount: number;
  memo: string | null;
  created_at: string;
  direction: "in" | "out";
};

export type TransferPage = {
  items: Transfer[];
  total: number;
  page: number;
  page_size: number;
};

export type Account = {
  username: string;
  balance: number;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "bank.token";
const CSRF_KEY = "bank.csrf";

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredCsrf(): string | null {
  return localStorage.getItem(CSRF_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function storeCsrf(csrf: string): void {
  localStorage.setItem(CSRF_KEY, csrf);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CSRF_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const record = (body ?? {}) as Record<string, unknown>;
    const message =
      typeof record.message === "string"
        ? record.message
        : typeof record.error === "string"
          ? record.error
          : res.statusText || "Request failed";
    if (res.status === 401 && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export const api = {
  register(username: string, password: string): Promise<Account> {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  async login(username: string, password: string): Promise<string> {
    const { token } = await request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    return token;
  },

  logout(): Promise<{ message: string }> {
    return request("/api/auth/logout", { method: "POST" });
  },

  async csrf(): Promise<string> {
    const { csrf_token } = await request<{ csrf_token: string }>("/api/auth/csrf");
    return csrf_token;
  },

  account(): Promise<Account> {
    return request("/api/account");
  },

  createTransfer(payload: {
    to_username: string;
    amount: number | string;
    memo?: string;
  }): Promise<Transfer> {
    const csrf = getStoredCsrf();
    return request("/api/transfers", {
      method: "POST",
      headers: csrf ? { "X-CSRF-Token": csrf } : undefined,
      body: JSON.stringify(payload),
    });
  },

  transfers(page: number, pageSize: number): Promise<TransferPage> {
    return request(`/api/transfers?page=${page}&page_size=${pageSize}`);
  },

  transfer(id: number): Promise<Transfer> {
    return request(`/api/transfers/${id}`);
  },
};

export function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
