export type Account = {
  username: string;
  balance: number;
};

export type Transfer = {
  id: number;
  to_username: string;
  amount: number;
  memo: string | null;
  created_at: string;
  from_username: string;
  direction: "in" | "out";
};

export type TransferPage = {
  items: Transfer[];
  total: number;
  page: number;
  page_size: number;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "bank.token";
let csrfToken: string | null = null;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  csrfToken = null;
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  csrfToken = null;
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const response = await fetch(path, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

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
    const body = payload as { error?: unknown; message?: unknown } | null;
    const message =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
          : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export async function refreshCsrf(): Promise<string | null> {
  try {
    const data = await request<{ csrf_token: string }>("/api/auth/csrf");
    csrfToken = data.csrf_token;
    return csrfToken;
  } catch {
    csrfToken = null;
    return null;
  }
}

export async function register(username: string, password: string): Promise<void> {
  await request("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export async function login(username: string, password: string): Promise<void> {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
  setToken(data.token);
  void refreshCsrf();
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    clearToken();
  }
}

export function getAccount(): Promise<Account> {
  return request<Account>("/api/account");
}

export async function createTransfer(input: {
  to_username: string;
  amount: number;
  memo?: string;
}): Promise<Transfer> {
  if (!csrfToken) await refreshCsrf();
  return request<Transfer>("/api/transfers", { method: "POST", body: input });
}

export function listTransfers(page: number, pageSize: number): Promise<TransferPage> {
  return request<TransferPage>(`/api/transfers?page=${page}&page_size=${pageSize}`);
}
