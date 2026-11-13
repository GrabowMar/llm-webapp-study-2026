import type {
  Customer,
  CustomerInput,
  CustomerListResponse,
  Interaction,
  InteractionInput,
  InteractionListResponse,
} from "./types";

export type FieldErrors = { [field: string]: string };

export interface ApiErrorShape {
  message: string;
  errors?: FieldErrors;
}

export class ApiError extends Error {
  status: number;
  errors: FieldErrors;

  constructor(status: number, body: ApiErrorShape) {
    super(body?.message || `Request failed (${status})`);
    this.status = status;
    this.errors = body?.errors || {};
  }
}

let token: string | null = localStorage.getItem("directory_token");

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  if (value) localStorage.setItem("directory_token", value);
  else localStorage.removeItem("directory_token");
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function api<T>(
  path: string,
  { method = "GET", body, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { message: "Cannot reach the server. Please try again." });
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth && token) {
      setToken(null);
      window.dispatchEvent(new Event("directory:unauthorized"));
    }
    const shape: ApiErrorShape =
      payload && typeof payload === "object"
        ? (payload as ApiErrorShape)
        : { message: `Request failed (${response.status})` };
    throw new ApiError(response.status, shape);
  }
  return payload as T;
}

export async function register(
  username: string,
  password: string,
): Promise<{ token: string }> {
  return api<{ token: string }>("/api/auth/register", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string }> {
  return api<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
}

export async function listCustomers(params: {
  q?: string;
  company?: string;
  page?: number;
  page_size?: number;
}): Promise<CustomerListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.company) query.set("company", params.company);
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const suffix = query.toString() ? `?${query}` : "";
  return api<CustomerListResponse>(`/api/customers${suffix}`);
}

export function getCustomer(id: number): Promise<Customer> {
  return api<Customer>(`/api/customers/${id}`);
}

export function createCustomer(input: CustomerInput): Promise<Customer> {
  return api<Customer>("/api/customers", { method: "POST", body: input });
}

export function updateCustomer(
  id: number,
  input: CustomerInput,
): Promise<Customer> {
  return api<Customer>(`/api/customers/${id}`, { method: "PUT", body: input });
}

export function deleteCustomer(id: number): Promise<unknown> {
  return api<unknown>(`/api/customers/${id}`, { method: "DELETE" });
}

export function listInteractions(
  id: number,
): Promise<InteractionListResponse> {
  return api<InteractionListResponse>(`/api/customers/${id}/interactions`);
}

export function createInteraction(
  id: number,
  input: InteractionInput,
): Promise<Interaction> {
  return api<Interaction>(`/api/customers/${id}/interactions`, {
    method: "POST",
    body: input,
  });
}
