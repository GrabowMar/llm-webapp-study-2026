export interface CheckResult {
  valid: boolean;
  error: string | null;
  line: number | null;
  column: number | null;
  root_element: string | null;
}

export interface SavedCheck extends CheckResult {
  id: number;
  xml_preview: string;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  options: { token?: string | null; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/api/auth/register", {
      body: { username, password },
    }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("POST", "/api/auth/login", {
      body: { username, password },
    }),
  logout: (token: string) => request<void>("POST", "/api/auth/logout", { token }),
  me: (token: string) => request<{ id: number; username: string }>("GET", "/api/auth/me", { token }),
  check: (xml: string) => request<CheckResult>("POST", "/api/validate/xml", { body: { xml } }),
  save: (token: string, xml: string) =>
    request<SavedCheck>("POST", "/api/validations", { token, body: { xml } }),
  list: (token: string, params: { valid?: boolean; page: number; pageSize: number }) => {
    const q = new URLSearchParams({ page: String(params.page), page_size: String(params.pageSize) });
    if (params.valid !== undefined) q.set("valid", String(params.valid));
    return request<Page<SavedCheck>>("GET", `/api/validations?${q}`, { token });
  },
  remove: (token: string, id: number) => request<void>("DELETE", `/api/validations/${id}`, { token }),
};
