export interface Customer {
  id: number;
  name: string;
  email: string | null;
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

export interface CustomerList {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
}

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
}

export interface InteractionInput {
  kind: string;
  summary: string;
  occurred_at?: string;
}

export interface Session {
  token: string;
  username?: string;
}

const TOKEN_KEY = "customer-directory.token";
const USERNAME_KEY = "customer-directory.username";

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

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return window.localStorage.getItem(USERNAME_KEY);
}

export function storeSession(token: string, username: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USERNAME_KEY, username);
}

export function storeUsername(username: string) {
  window.localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
}

function extractFields(payload: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!payload || typeof payload !== "object") return fields;
  const record = payload as Record<string, unknown>;
  const sources = [record.fields, record.errors];
  for (const source of sources) {
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        fields[key] = String(value);
      }
    }
  }
  if (Array.isArray(record.details)) {
    for (const item of record.details) {
      if (item && typeof item === "object") {
        const entry = item as { field?: string; message?: string };
        if (entry.field) fields[entry.field] = String(entry.message ?? "");
      }
    }
  }
  return fields;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const record = (payload ?? {}) as Record<string, unknown>;
    const message =
      typeof record.error === "string"
        ? record.error
        : typeof record.message === "string"
          ? record.message
          : `The request failed (${response.status}).`;
    throw new ApiError(response.status, message, extractFields(payload));
  }
  return payload as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export const api = {
  register(username: string, password: string) {
    return request<Session>("/api/auth/register", {
      method: "POST",
      body: jsonBody({ username, password }),
    });
  },

  login(username: string, password: string) {
    return request<Session>("/api/auth/login", {
      method: "POST",
      body: jsonBody({ username, password }),
    });
  },

  me() {
    return request<{ id: number; username: string }>("/api/auth/me");
  },

  logout() {
    return request<{ status: string }>("/api/auth/logout", { method: "POST" });
  },

  listCustomers(params: Record<string, string | number>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== "" && value !== undefined && value !== null) search.set(key, String(value));
    }
    const query = search.toString();
    return request<CustomerList>(`/api/customers${query ? `?${query}` : ""}`);
  },

  listCompanies() {
    return request<{ items: string[] }>("/api/companies");
  },

  getCustomer(id: number) {
    return request<Customer>(`/api/customers/${id}`);
  },

  createCustomer(payload: CustomerInput) {
    return request<Customer>("/api/customers", {
      method: "POST",
      body: jsonBody(payload),
    });
  },

  updateCustomer(id: number, payload: CustomerInput) {
    return request<Customer>(`/api/customers/${id}`, {
      method: "PUT",
      body: jsonBody(payload),
    });
  },

  deleteCustomer(id: number) {
    return request<{ status: string }>(`/api/customers/${id}`, { method: "DELETE" });
  },

  listInteractions(id: number) {
    return request<{ items: Interaction[] }>(`/api/customers/${id}/interactions`);
  },

  createInteraction(id: number, payload: InteractionInput) {
    return request<Interaction>(`/api/customers/${id}/interactions`, {
      method: "POST",
      body: jsonBody(payload),
    });
  },
};
