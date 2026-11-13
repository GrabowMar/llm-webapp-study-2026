export interface Conversion {
  id: string;
  direction: "encode" | "decode";
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

export class ApiError extends Error {}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message);
  }
  return data as T;
}

export function register(username: string, password: string) {
  return request<{ username: string }>("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function encodeText(text: string) {
  return request<{ encoded: string }>("/api/base64/encode", {
    method: "POST",
    body: { text },
  });
}

export function decodeText(encoded: string) {
  return request<{ text: string }>("/api/base64/decode", {
    method: "POST",
    body: { encoded },
  });
}

export function saveConversion(
  token: string,
  direction: "encode" | "decode",
  input: string,
) {
  return request<Conversion>("/api/conversions", {
    method: "POST",
    token,
    body: { direction, input },
  });
}

export function listConversions(token: string, page: number, pageSize: number) {
  return request<ConversionPage>(
    `/api/conversions?page=${page}&page_size=${pageSize}`,
    { token },
  );
}

export function deleteConversion(token: string, id: string) {
  return request<void>(`/api/conversions/${id}`, { method: "DELETE", token });
}
