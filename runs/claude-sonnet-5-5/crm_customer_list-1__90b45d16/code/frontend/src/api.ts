export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  interaction_count: number;
  last_contacted_at: string | null;
}

export interface Interaction {
  id: number;
  customer_id: number;
  kind: string;
  summary: string;
  occurred_at: string;
  logged_by: string;
}

export interface CustomerPage {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
}

export interface CustomerInput {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
}

export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;
  constructor(status: number, message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const TOKEN_KEY = "directory.token";
const USER_KEY = "directory.user";
let onUnauthorized: () => void = () => {};

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser = () => localStorage.getItem(USER_KEY);
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export function storeSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
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
    throw new ApiError(0, "Could not reach the server", {});
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(
      res.status,
      data?.error ?? `Request failed (${res.status})`,
      data?.errors ?? {},
    );
  }
  return data as T;
}

export async function login(username: string, password: string) {
  const { token } = await request<{ token: string }>("POST", "/auth/login", {
    username,
    password,
  });
  storeSession(token, username);
}

export const register = (username: string, password: string) =>
  request<{ username: string }>("POST", "/auth/register", { username, password });

export function listCustomers(params: {
  q: string;
  company: string;
  page: number;
  page_size: number;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.company) qs.set("company", params.company);
  qs.set("page", String(params.page));
  qs.set("page_size", String(params.page_size));
  return request<CustomerPage>("GET", `/customers?${qs}`);
}

export const listCompanies = () =>
  request<{ items: string[] }>("GET", "/companies").then((r) => r.items);
export const getCustomer = (id: string | number) =>
  request<Customer>("GET", `/customers/${id}`);
export const createCustomer = (input: CustomerInput) =>
  request<Customer>("POST", "/customers", input);
export const updateCustomer = (id: string | number, input: CustomerInput) =>
  request<Customer>("PUT", `/customers/${id}`, input);
export const deleteCustomer = (id: string | number) =>
  request<void>("DELETE", `/customers/${id}`);
export const listInteractions = (id: string | number) =>
  request<{ items: Interaction[] }>("GET", `/customers/${id}/interactions`).then(
    (r) => r.items,
  );
export const logInteraction = (
  id: string | number,
  input: { kind: string; summary: string; occurred_at?: string },
) => request<Interaction>("POST", `/customers/${id}/interactions`, input);
