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

export interface CheckPage {
  items: SavedCheck[];
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
  path: string,
  method = "GET",
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    const obj = data as { error?: string } | null;
    throw new ApiError(res.status, obj?.error ?? `request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/auth/register", "POST", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", "POST", { username, password }),
  validate: (xml: string) => request<CheckResult>("/validate/xml", "POST", { xml }),
  saveValidation: (xml: string, token: string) =>
    request<SavedCheck>("/validations", "POST", { xml }, token),
  listValidations: (
    token: string,
    params: { valid?: "true" | "false" | null; page?: number; page_size?: number },
  ) => {
    const q = new URLSearchParams();
    if (params.valid) q.set("valid", params.valid);
    if (params.page) q.set("page", String(params.page));
    if (params.page_size) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q}` : "";
    return request<CheckPage>(`/validations${suffix}`, "GET", undefined, token);
  },
  deleteValidation: (id: number, token: string) =>
    request<unknown>(`/validations/${id}`, "DELETE", undefined, token),
};
