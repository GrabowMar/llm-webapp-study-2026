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

export type ValidationList = {
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
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const response = await fetch(path, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data !== null && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export function register(username: string, password: string): Promise<unknown> {
  return request("/api/auth/register", { body: { username, password } });
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", { body: { username, password } });
}

export function validateXml(xml: string): Promise<CheckResult> {
  return request("/api/validate/xml", { body: { xml } });
}

export function saveValidation(xml: string, token: string): Promise<SavedCheck> {
  return request("/api/validations", { body: { xml }, token });
}

export function listValidations(
  token: string,
  params: { valid?: boolean | null; page: number; page_size: number },
): Promise<ValidationList> {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("page_size", String(params.page_size));
  if (params.valid !== null && params.valid !== undefined) {
    query.set("valid", params.valid ? "true" : "false");
  }
  return request(`/api/validations?${query.toString()}`, { token });
}

export function deleteValidation(token: string, id: number): Promise<void> {
  return request(`/api/validations/${id}`, { method: "DELETE", token });
}
