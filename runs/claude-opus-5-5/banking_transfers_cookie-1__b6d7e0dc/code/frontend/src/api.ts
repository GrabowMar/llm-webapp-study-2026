export type Transfer = {
  id: number;
  from_username: string;
  to_username: string;
  amount: number;
  memo: string;
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

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "bank.token";

let token: string | null = sessionStorage.getItem(TOKEN_KEY);
let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  csrfToken = null;
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (token && method !== "GET") {
    if (!csrfToken && path !== "/api/auth/csrf") {
      csrfToken = (await request<{ csrf_token: string }>("GET", "/api/auth/csrf")).csrf_token;
    }
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Please try again.");
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status}).`;
    if (res.status === 401 && token && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/api/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/api/auth/login", { username, password }),
  logout: () => request<{ status: string }>("POST", "/api/auth/logout"),
  account: () => request<Account>("GET", "/api/account"),
  createTransfer: (to_username: string, amount: number, memo: string) =>
    request<Transfer>("POST", "/api/transfers", { to_username, amount, memo }),
  listTransfers: (page: number, pageSize: number) =>
    request<TransferPage>(
      "GET",
      `/api/transfers?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`,
    ),
};

const money = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return money.format(value);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
