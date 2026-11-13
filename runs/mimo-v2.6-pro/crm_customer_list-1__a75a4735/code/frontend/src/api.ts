import type {
  Customer,
  CustomerList,
  CustomerPayload,
  Interaction,
  InteractionPayload,
} from "./types";

const TOKEN_KEY = "customer-directory.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (init && init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(path, { method: init?.method ?? "GET", headers, body });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; message?: string; errors?: Record<string, string> };
    const message = payload.error ?? payload.message ?? `Request failed with status ${res.status}`;
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("auth-expired"));
    }
    throw new ApiError(res.status, message, payload.errors ?? {});
  }
  return data as T;
}

export interface AuthUser {
  id: number;
  username: string;
}

export function register(username: string, password: string): Promise<AuthUser & { token: string }> {
  return request("/api/auth/register", { method: "POST", body: { username, password } });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", { method: "POST", body: { username, password } });
}

export function fetchMe(): Promise<AuthUser> {
  return request("/api/auth/me");
}

export function listCustomers(params: {
  q?: string;
  company?: string;
  page?: number;
  page_size?: number;
}): Promise<CustomerList> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.company) search.set("company", params.company);
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  const qs = search.toString();
  return request(`/api/customers${qs ? `?${qs}` : ""}`);
}

export function getCustomer(id: number): Promise<Customer> {
  return request(`/api/customers/${id}`);
}

export function createCustomer(body: CustomerPayload): Promise<Customer> {
  return request("/api/customers", { method: "POST", body });
}

export function updateCustomer(id: number, body: CustomerPayload): Promise<Customer> {
  return request(`/api/customers/${id}`, { method: "PUT", body });
}

export function deleteCustomer(id: number): Promise<void> {
  return request(`/api/customers/${id}`, { method: "DELETE" });
}

export function listInteractions(id: number): Promise<{ items: Interaction[] }> {
  return request(`/api/customers/${id}/interactions`);
}

export function createInteraction(id: number, body: InteractionPayload): Promise<Interaction> {
  return request(`/api/customers/${id}/interactions`, { method: "POST", body });
}
