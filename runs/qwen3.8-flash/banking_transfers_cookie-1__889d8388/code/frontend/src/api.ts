export interface Transfer {
  id: number;
  to_username: string;
  from_username: string;
  amount: number;
  memo: string;
  created_at: string;
  direction: "in" | "out";
}

export interface TransferPage {
  items: Transfer[];
  total: number;
  page: number;
  page_size: number;
}

export interface Account {
  username: string;
  balance: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
    csrf?: string | null;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.csrf) headers["X-CSRF-Token"] = options.csrf;

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const record = (data ?? {}) as Record<string, string>;
    throw new ApiError(record.message || record.error || `Request failed (${response.status})`, response.status);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/api/auth/register", { method: "POST", body: { username, password } }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/api/auth/login", { method: "POST", body: { username, password } }),
  logout: (token: string) => request<{ ok: boolean }>("/api/auth/logout", { method: "POST", token }),
  csrf: (token: string) => request<{ csrf_token: string }>("/api/auth/csrf", { token }),
  account: (token: string) => request<Account>("/api/account", { token }),
  listTransfers: (token: string, page: number, pageSize: number) =>
    request<TransferPage>(`/api/transfers?page=${page}&page_size=${pageSize}`, { token }),
  createTransfer: (
    token: string,
    csrf: string,
    body: { to_username: string; amount: number; memo?: string },
  ) => request<Transfer>("/api/transfers", { method: "POST", body, token, csrf }),
};
