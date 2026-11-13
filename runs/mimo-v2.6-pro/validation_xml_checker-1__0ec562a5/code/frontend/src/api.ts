import type { CheckResult, SavedCheck, SavedPage, Session } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function toError(res: Response): Promise<ApiError> {
  let message = `Request failed with status ${res.status}`;
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") message = body.error;
  } catch {
    // non-JSON error body, keep the default message
  }
  return new ApiError(res.status, message);
}

async function request<T>(path: string, session: Session | null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers["Authorization"] = `Bearer ${session.token}`;
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

export async function register(username: string, password: string): Promise<void> {
  await request("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data.token;
}

export function checkXml(xml: string): Promise<CheckResult> {
  return request<CheckResult>("/api/validate/xml", null, {
    method: "POST",
    body: JSON.stringify({ xml }),
  });
}

export function saveCheck(session: Session, xml: string): Promise<SavedCheck> {
  return request<SavedCheck>("/api/validations", session, {
    method: "POST",
    body: JSON.stringify({ xml }),
  });
}

export function listChecks(
  session: Session,
  params: { valid: boolean | null; page: number; pageSize: number },
): Promise<SavedPage> {
  const query = new URLSearchParams();
  if (params.valid !== null) query.set("valid", String(params.valid));
  query.set("page", String(params.page));
  query.set("page_size", String(params.pageSize));
  return request<SavedPage>(`/api/validations?${query.toString()}`, session);
}

export function deleteCheck(session: Session, id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/validations/${id}`, session, {
    method: "DELETE",
  });
}
