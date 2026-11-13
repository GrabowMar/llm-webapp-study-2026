export type Direction = "encode" | "decode";

export interface Conversion {
  id: number;
  direction: Direction;
  input_preview: string;
  output_preview: string;
  created_at: string;
  output?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Network error. Please try again.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && typeof data.error === "string" && data.error) ||
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/auth/register", {
      method: "POST",
      body: { username, password },
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: { username, password },
    }),
  encode: (text: string) =>
    request<{ encoded: string }>("/base64/encode", {
      method: "POST",
      body: { text },
    }),
  decode: (encoded: string) =>
    request<{ text: string }>("/base64/decode", {
      method: "POST",
      body: { encoded },
    }),
  saveConversion: (direction: Direction, input: string, token: string) =>
    request<Conversion>("/conversions", {
      method: "POST",
      body: { direction, input },
      token,
    }),
  list: (token: string, page: number, pageSize: number) =>
    request<Page<Conversion>>(
      `/conversions?page=${page}&page_size=${pageSize}`,
      { token },
    ),
  remove: (token: string, id: number) =>
    request<{ status: string; id: number }>(`/conversions/${id}`, {
      method: "DELETE",
      token,
    }),
};
