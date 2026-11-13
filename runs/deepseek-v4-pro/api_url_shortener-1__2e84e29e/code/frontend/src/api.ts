export interface Link {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
  short_url: string;
  owner: string;
  active?: number;
}

export interface PagedLinks {
  items: Link[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuthState {
  token: string;
  username: string;
}

const TOKEN_KEY = "token";
const USERNAME_KEY = "username";

export function getAuth(): AuthState | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  if (!token || !username) return null;
  return { token, username };
}

export function setAuth(auth: AuthState) {
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(USERNAME_KEY, auth.username);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") message = body.error;
  } catch {
    /* ignore */
  }
  throw new ApiError(res.status, message);
}

function headers(auth?: AuthState | null): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (auth?.token) h["Authorization"] = `Bearer ${auth.token}`;
  return h;
}

export async function register(
  username: string,
  password: string,
): Promise<void> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  await handle(res);
}

export async function login(
  username: string,
  password: string,
): Promise<AuthState> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await handle<{ token: string; username?: string }>(res);
  return { token: body.token, username: body.username ?? username };
}

export async function createLink(
  auth: AuthState,
  originalUrl: string,
): Promise<Link> {
  const res = await fetch("/api/links", {
    method: "POST",
    headers: headers(auth),
    body: JSON.stringify({ original_url: originalUrl }),
  });
  return handle<Link>(res);
}

export async function listLinks(
  auth: AuthState,
  page: number,
  pageSize: number,
): Promise<PagedLinks> {
  const res = await fetch(
    `/api/links?page=${page}&page_size=${pageSize}`,
    { headers: headers(auth) },
  );
  return handle<PagedLinks>(res);
}

export async function deleteLink(auth: AuthState, id: number): Promise<void> {
  const res = await fetch(`/api/links/${id}`, {
    method: "DELETE",
    headers: headers(auth),
  });
  await handle(res);
}

export async function listAdminLinks(
  auth: AuthState,
  page: number,
  pageSize: number,
): Promise<PagedLinks> {
  const res = await fetch(
    `/api/admin/links?page=${page}&page_size=${pageSize}`,
    { headers: headers(auth) },
  );
  return handle<PagedLinks>(res);
}

export async function toggleLink(auth: AuthState, id: number): Promise<Link> {
  const res = await fetch(`/api/admin/links/${id}/toggle`, {
    method: "POST",
    headers: headers(auth),
  });
  return handle<Link>(res);
}
