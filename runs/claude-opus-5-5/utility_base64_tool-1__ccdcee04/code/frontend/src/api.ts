export type Direction = "encode" | "decode";

export interface Conversion {
  id: number;
  direction: Direction;
  input_preview: string;
  output_preview: string;
  created_at: string;
  input_length?: number;
  output_length?: number;
}

export interface SavedConversion extends Conversion {
  output: string;
}

export interface ConversionPage {
  items: Conversion[];
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
  options: { body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server");
  }

  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/api/auth/register", {
      body: { username, password },
    }),
  login: (username: string, password: string) =>
    request<{ token: string; username?: string }>("POST", "/api/auth/login", {
      body: { username, password },
    }),
  logout: (token: string) => request<void>("POST", "/api/auth/logout", { token }),
  me: (token: string) => request<{ id: number; username: string }>("GET", "/api/auth/me", { token }),
  encode: (text: string) =>
    request<{ encoded: string }>("POST", "/api/base64/encode", { body: { text } }),
  decode: (encoded: string) =>
    request<{ text: string }>("POST", "/api/base64/decode", { body: { encoded } }),
  saveConversion: (token: string, direction: Direction, input: string) =>
    request<SavedConversion>("POST", "/api/conversions", { token, body: { direction, input } }),
  listConversions: (token: string, page: number, pageSize: number) =>
    request<ConversionPage>(
      "GET",
      `/api/conversions?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(pageSize)}`,
      { token },
    ),
  deleteConversion: (token: string, id: number) =>
    request<void>("DELETE", `/api/conversions/${id}`, { token }),
};
