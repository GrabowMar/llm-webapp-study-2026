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

export type Interaction = {
  id: number;
  customer_id: number;
  kind: "call" | "email" | "meeting";
  summary: string;
  occurred_at: string;
  logged_by: string;
};

export type CustomerPage = { items: Customer[]; total: number; page: number; page_size: number };
export type Overview = { customers: number; companies: number; interactions: number; contacted: number; company_options: string[] };
export type User = { id: number; username: string };

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;
  constructor(message: string, status: number, errors: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("commonplace-token");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/login")) {
      window.dispatchEvent(new Event("commonplace-session-expired"));
    }
    throw new ApiError(data.error || "Something went wrong. Please try again.", response.status, data.errors);
  }
  return data as T;
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function date(value: string | null, withTime = false) {
  if (!value) return "Not contacted yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
