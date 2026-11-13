export type Customer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  interaction_count: number;
  last_contacted_at: string | null;
};

export type CustomerInput = {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
};

export type InteractionKind = "call" | "email" | "meeting";

export type Interaction = {
  id: number;
  customer_id: number;
  kind: InteractionKind;
  summary: string;
  occurred_at: string;
  logged_by: string;
};

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  status: number;
  errors: FieldErrors;

  constructor(status: number, message: string, errors: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const TOKEN_KEY = "customer-directory.token";
const USER_KEY = "customer-directory.user";

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  username: () => localStorage.getItem(USER_KEY),
  save(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; errors?: FieldErrors };
    if (res.status === 401 && token && !path.startsWith("/auth/")) onUnauthorized();
    throw new ApiError(res.status, payload.error || `Request failed (${res.status}).`, payload.errors ?? {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username?: string }>("POST", "/auth/login", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),

  listCustomers(params: { q?: string; company?: string; page?: number; page_size?: number }) {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.company) search.set("company", params.company);
    if (params.page) search.set("page", String(params.page));
    if (params.page_size) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return request<Page<Customer>>("GET", `/customers${qs ? `?${qs}` : ""}`);
  },
  listCompanies: () => request<{ items: string[] }>("GET", "/companies"),
  getCustomer: (id: number) => request<Customer>("GET", `/customers/${id}`),
  createCustomer: (input: CustomerInput) => request<Customer>("POST", "/customers", input),
  updateCustomer: (id: number, input: CustomerInput) => request<Customer>("PUT", `/customers/${id}`, input),
  deleteCustomer: (id: number) => request<void>("DELETE", `/customers/${id}`),

  listInteractions: (id: number) => request<{ items: Interaction[] }>("GET", `/customers/${id}/interactions`),
  createInteraction: (id: number, input: { kind: InteractionKind; summary: string; occurred_at?: string }) =>
    request<Interaction>("POST", `/customers/${id}/interactions`, input),
};

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
