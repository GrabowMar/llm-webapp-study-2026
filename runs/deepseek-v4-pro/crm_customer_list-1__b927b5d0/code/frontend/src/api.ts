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

const TOKEN_KEY = "directory_token";
const USERNAME_KEY = "directory_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearSession();
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface FieldErrors {
  [field: string]: string;
}

export function extractErrors(body: unknown): FieldErrors {
  if (body && typeof body === "object" && "errors" in body) {
    const errors = (body as { errors: unknown }).errors;
    if (errors && typeof errors === "object") {
      return errors as FieldErrors;
    }
  }
  if (body && typeof body === "object" && "error" in body) {
    return { form: (body as { error: string }).error };
  }
  return {};
}

export const api = {
  register(username: string, password: string) {
    return request<{ id: number; username: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  login(username: string, password: string) {
    return request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  listCustomers(params: { q?: string; company?: string; page?: number; page_size?: number }) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.company) query.set("company", params.company);
    if (params.page) query.set("page", String(params.page));
    if (params.page_size) query.set("page_size", String(params.page_size));
    const qs = query.toString();
    return request<CustomerList>(`/api/customers${qs ? `?${qs}` : ""}`);
  },
  getCustomer(id: number) {
    return request<Customer>(`/api/customers/${id}`);
  },
  createCustomer(data: Partial<Customer>) {
    return request<Customer>("/api/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateCustomer(id: number, data: Partial<Customer>) {
    return request<Customer>(`/api/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  deleteCustomer(id: number) {
    return request<{ ok: boolean }>(`/api/customers/${id}`, { method: "DELETE" });
  },
  listInteractions(customerId: number) {
    return request<{ items: Interaction[] }>(`/api/customers/${customerId}/interactions`);
  },
  createInteraction(customerId: number, data: { kind: string; summary: string; occurred_at?: string }) {
    return request<Interaction>(`/api/customers/${customerId}/interactions`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
