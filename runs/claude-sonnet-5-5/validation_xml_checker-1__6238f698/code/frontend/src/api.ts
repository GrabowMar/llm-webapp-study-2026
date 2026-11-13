export type CheckResult = {
  valid: boolean;
  error: string | null;
  line: number | null;
  column: number | null;
  root_element: string | null;
};

export type SavedCheck = CheckResult & {
  id: number;
  xml_preview: string;
  created_at: string;
};

export type Page = {
  items: SavedCheck[];
  total: number;
  page: number;
  page_size: number;
};

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
  token: string | null,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      /* no body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<unknown>("POST", "/auth/register", null, { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("POST", "/auth/login", null, {
      username,
      password,
    }),
  me: (token: string) => request<{ username: string }>("GET", "/auth/me", token),
  logout: (token: string) => request<void>("POST", "/auth/logout", token),
  check: (xml: string) => request<CheckResult>("POST", "/validate/xml", null, { xml }),
  save: (token: string, xml: string) =>
    request<SavedCheck>("POST", "/validations", token, { xml }),
  list: (token: string, page: number, pageSize: number, valid: boolean | null) => {
    const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (valid !== null) q.set("valid", String(valid));
    return request<Page>("GET", `/validations?${q}`, token);
  },
  remove: (token: string, id: number) =>
    request<void>("DELETE", `/validations/${id}`, token),
};
