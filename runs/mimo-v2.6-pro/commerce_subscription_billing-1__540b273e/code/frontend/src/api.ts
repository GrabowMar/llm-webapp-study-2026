export interface Session {
  token: string;
  username: string;
}

const SESSION_KEY = "billing-console.session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as Session).token === "string" &&
      typeof (parsed as Session).username === "string"
    ) {
      return parsed as Session;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export interface Subscription {
  id: number;
  customer_name: string;
  plan: string;
  monthly_amount: number;
  renewal_date: string;
  status: string;
  failed_payment_count: number;
  created_at: string;
}

export interface Invoice {
  id: number;
  subscription_id: number;
  amount_due: number;
  due_date: string;
  status: string;
  paid_at: string | null;
}

export interface PagedSubscriptions {
  items: Subscription[];
  total: number;
  page: number;
  page_size: number;
}

export interface InvoiceList {
  items: Invoice[];
}

export interface PublicStats {
  mrr: number;
  counts: Record<string, number>;
}

export interface CollectionResult {
  run: {
    id: number;
    subscription_id: number;
    outcome: string;
    created_at: string;
  };
  subscription: Subscription;
  invoices: Invoice[];
}

export interface SubscriptionInput {
  customer_name: string;
  plan: string;
  monthly_amount: number;
  renewal_date: string;
  status: string;
}

export interface ListSubscriptionsParams {
  q?: string;
  status?: string;
  plan?: string;
  page?: number;
  page_size?: number;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const session = loadSession();
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message =
      payload !== null &&
      typeof payload === "object" &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export function registerAccount(
  username: string,
  password: string,
): Promise<{ id: number; username: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export function login(
  username: string,
  password: string,
): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function listSubscriptions(
  params: ListSubscriptionsParams = {},
): Promise<PagedSubscriptions> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.plan) search.set("plan", params.plan);
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.page_size !== undefined)
    search.set("page_size", String(params.page_size));
  const query = search.toString();
  return request(`/api/subscriptions${query ? `?${query}` : ""}`);
}

export function getSubscription(id: number): Promise<Subscription> {
  return request(`/api/subscriptions/${id}`);
}

export function createSubscription(
  input: SubscriptionInput,
): Promise<Subscription> {
  return request("/api/subscriptions", { method: "POST", body: input });
}

export function updateSubscription(
  id: number,
  patch: Partial<SubscriptionInput>,
): Promise<Subscription> {
  return request(`/api/subscriptions/${id}`, { method: "PATCH", body: patch });
}

export function listInvoices(id: number): Promise<InvoiceList> {
  return request(`/api/subscriptions/${id}/invoices`);
}

export function issueInvoice(
  id: number,
  input: { amount_due?: number; due_date?: string },
): Promise<Invoice> {
  return request(`/api/subscriptions/${id}/invoices`, {
    method: "POST",
    body: input,
  });
}

export function recordCollection(
  id: number,
  outcome: "failed" | "succeeded",
): Promise<CollectionResult> {
  return request(`/api/subscriptions/${id}/collections`, {
    method: "POST",
    body: { outcome },
  });
}

export function getPublicStats(): Promise<PublicStats> {
  return request("/api/public/stats");
}
