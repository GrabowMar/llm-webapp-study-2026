const TOKEN_KEY = "cd_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (auth && getToken()) headers["Authorization"] = `Bearer ${getToken()}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non JSON body */
  }
  if (!res.ok) {
    const err = (data as { error?: string }) ?? null;
    if (res.status === 401 && auth && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, err?.error ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export interface CustomerQuery {
  q?: string;
  company?: string;
  page?: number;
  page_size?: number;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }, false),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }, false),
  listCustomers: (params: CustomerQuery) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.company) search.set("company", params.company);
    if (params.page) search.set("page", String(params.page));
    if (params.page_size) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return request<import("./types").CustomerPage>(`/customers${qs ? `?${qs}` : ""}`);
  },
  getCustomer: (id: number) => request<import("./types").Customer>(`/customers/${id}`),
  createCustomer: (input: import("./types").CustomerInput) =>
    request<import("./types").Customer>("/customers", { method: "POST", body: JSON.stringify(input) }),
  updateCustomer: (id: number, input: import("./types").CustomerInput) =>
    request<import("./types").Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteCustomer: (id: number) => request<void>(`/customers/${id}`, { method: "DELETE" }),
  listInteractions: (id: number) =>
    request<{ items: import("./types").Interaction[] }>(`/customers/${id}/interactions`),
  createInteraction: (id: number, input: import("./types").InteractionInput) =>
    request<import("./types").Interaction>(`/customers/${id}/interactions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
