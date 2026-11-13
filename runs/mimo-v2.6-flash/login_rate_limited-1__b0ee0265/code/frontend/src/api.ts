export type Account = {
  id: number;
  username: string;
  last_login_at: string | null;
};

export type LoginAttempt = {
  at: string;
  success: boolean;
};

export type Lock = {
  username: string;
  locked_until: string;
};

export type ErrorBody = {
  error?: string;
  code?: string;
  retry_after?: number;
};

export type ApiResult<T> = {
  status: number;
  data: T | null;
  retryAfter: number | null;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    return { status: 0, data: null, retryAfter: null };
  }
  const retryHeader = response.headers.get("Retry-After");
  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  return {
    status: response.status,
    data,
    retryAfter: retryHeader === null ? null : Number(retryHeader),
  };
}

export function messageFrom(result: ApiResult<unknown>): string {
  const body = result.data as ErrorBody | null;
  if (body && typeof body.error === "string" && body.error) {
    return body.error;
  }
  if (result.status === 0) {
    return "Could not reach the server.";
  }
  return "Something went wrong.";
}
