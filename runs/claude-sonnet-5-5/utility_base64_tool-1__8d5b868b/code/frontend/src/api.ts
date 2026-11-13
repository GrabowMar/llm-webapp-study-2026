export type Conversion = {
  id: number;
  direction: "encode" | "decode";
  input_preview: string;
  output_preview: string;
  created_at: string;
};

export type HistoryPage = {
  items: Conversion[];
  total: number;
  page: number;
  page_size: number;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let token: string | null = localStorage.getItem("token");

export function setToken(value: string | null) {
  token = value;
  if (value) localStorage.setItem("token", value);
  else localStorage.removeItem("token");
}

export function getToken() {
  return token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the server", 0);
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  me: () => request<{ id: number; username: string }>("GET", "/auth/me"),
  logout: () => request<void>("POST", "/auth/logout"),
  encode: (text: string) => request<{ encoded: string }>("POST", "/base64/encode", { text }),
  decode: (encoded: string) => request<{ text: string }>("POST", "/base64/decode", { encoded }),
  save: (direction: "encode" | "decode", input: string) =>
    request<Conversion & { output: string }>("POST", "/conversions", { direction, input }),
  history: (page: number, pageSize: number) =>
    request<HistoryPage>("GET", `/conversions?page=${page}&page_size=${pageSize}`),
  remove: (id: number) => request<void>("DELETE", `/conversions/${id}`),
};
