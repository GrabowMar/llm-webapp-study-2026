export interface Transfer {
  id: number;
  from_username: string;
  to_username: string;
  amount: number;
  memo: string | null;
  created_at: string;
  direction: "in" | "out";
}

export interface TransferList {
  items: Transfer[];
  total: number;
  page: number;
  page_size: number;
}

export interface Account {
  username: string;
  balance: number;
}

let token: string | null = localStorage.getItem("token");

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null) {
  token = value;
  if (value) {
    localStorage.setItem("token", value);
  } else {
    localStorage.removeItem("token");
  }
}

async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data && (data.error as string)) || `Request failed (${res.status})`
    );
  }
  return data as T;
}

export async function register(
  username: string,
  password: string
): Promise<Account> {
  return api<Account>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<void> {
  const data = await api<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
}

export async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
  setToken(null);
}

export async function getCsrf(): Promise<string> {
  const data = await api<{ csrf_token: string }>("/api/auth/csrf");
  return data.csrf_token;
}

export async function getAccount(): Promise<Account> {
  return api<Account>("/api/account");
}

export async function createTransfer(payload: {
  to_username: string;
  amount: number;
  memo?: string;
}): Promise<Transfer> {
  return api<Transfer>("/api/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listTransfers(
  page: number,
  pageSize: number
): Promise<TransferList> {
  return api<TransferList>(
    `/api/transfers?page=${page}&page_size=${pageSize}`
  );
}
