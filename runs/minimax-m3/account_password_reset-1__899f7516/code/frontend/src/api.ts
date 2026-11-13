export type Account = {
  id: number;
  username: string;
  email: string | null;
};

export type OutboxMessage = {
  id: number;
  to: string;
  subject: string;
  body: string;
  sent_at: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "account-service.token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token === null) {
      window.localStorage.removeItem(TOKEN_KEY);
    } else {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    /* storage is unavailable */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, { ...init, headers });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  return payload as T;
}

function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}

export function register(username: string, password: string, email: string) {
  return request<Account & { token: string }>("/auth/register", {
    method: "POST",
    ...jsonBody({ username, password, email: email || undefined }),
  });
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/auth/login", {
    method: "POST",
    ...jsonBody({ username, password }),
  });
  setToken(data.token);
  return data.token;
}

export async function logout() {
  try {
    await request<{ status: string }>("/auth/logout", { method: "POST" });
  } catch {
    /* the session is dropped locally either way */
  }
  setToken(null);
}

export function getMe() {
  return request<Account>("/me");
}

export function updateEmail(email: string) {
  return request<Account>("/me", { method: "PATCH", ...jsonBody({ email }) });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<{ status: string }>("/me/password", {
    method: "POST",
    ...jsonBody({ current_password: currentPassword, new_password: newPassword }),
  });
}

export function requestPasswordReset(identifier: string) {
  const value = identifier.trim();
  const payload = value.includes("@") ? { email: value } : { username: value };
  return request<{ message: string }>("/auth/password-reset", {
    method: "POST",
    ...jsonBody(payload),
  });
}

export function confirmPasswordReset(token: string, newPassword: string) {
  return request<{ status: string }>("/auth/password-reset/confirm", {
    method: "POST",
    ...jsonBody({ token, new_password: newPassword }),
  });
}

export function getOutbox(to: string) {
  return request<{ items: OutboxMessage[] }>(
    `/outbox?to=${encodeURIComponent(to.trim())}`,
  );
}
