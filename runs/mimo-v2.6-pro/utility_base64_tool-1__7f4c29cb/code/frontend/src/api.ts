export type Direction = "encode" | "decode";

export interface Conversion {
  id: number;
  direction: Direction;
  input_preview: string;
  output_preview: string;
  created_at: string;
  output?: string;
}

export interface ConversionPage {
  items: Conversion[];
  total: number;
  page: number;
  page_size: number;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export function register(username: string, password: string) {
  return request<{ username: string; token: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function encodeText(text: string) {
  return request<{ encoded: string }>("/api/base64/encode", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function decodeText(encoded: string) {
  return request<{ text: string }>("/api/base64/decode", {
    method: "POST",
    body: JSON.stringify({ encoded }),
  });
}

export function createConversion(
  direction: Direction,
  input: string,
  token: string,
) {
  return request<Conversion>(
    "/api/conversions",
    {
      method: "POST",
      body: JSON.stringify({ direction, input }),
    },
    token,
  );
}

export function listConversions(
  page: number,
  pageSize: number,
  token: string,
) {
  return request<ConversionPage>(
    `/api/conversions?page=${page}&page_size=${pageSize}`,
    {},
    token,
  );
}

export function deleteConversion(id: number, token: string) {
  return request<{ ok: boolean }>(
    `/api/conversions/${id}`,
    { method: "DELETE" },
    token,
  );
}
