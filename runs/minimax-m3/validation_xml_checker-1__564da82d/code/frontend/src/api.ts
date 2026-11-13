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

export interface ValidationPage {
  items: SavedCheck[];
  total: number;
  page: number;
  page_size: number;
}

export interface Session {
  username: string;
  token: string;
}

const TOKEN_KEY = "xml-checker.token";
const USERNAME_KEY = "xml-checker.username";

export function readSession(): Session | null {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const username = window.localStorage.getItem(USERNAME_KEY);
    if (!token || !username) return null;
    return { token, username };
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, session.token);
    window.localStorage.setItem(USERNAME_KEY, session.username);
  } catch {
    /* storage unavailable */
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const session = readSession();
  if (session) headers.set("Authorization", `Bearer ${session.token}`);

  const response = await fetch(path, { ...init, headers });
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
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export function validateXml(xml: string): Promise<CheckResult> {
  return request<CheckResult>("/api/validate/xml", {
    method: "POST",
    body: JSON.stringify({ xml }),
  });
}

export function saveValidation(xml: string): Promise<SavedCheck> {
  return request<SavedCheck>("/api/validations", {
    method: "POST",
    body: JSON.stringify({ xml }),
  });
}

export function listValidations(
  page: number,
  pageSize: number,
  valid: boolean | null,
): Promise<ValidationPage> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (valid !== null) params.set("valid", valid ? "true" : "false");
  return request<ValidationPage>(`/api/validations?${params.toString()}`);
}

export function deleteValidation(id: number): Promise<null> {
  return request<null>(`/api/validations/${id}`, { method: "DELETE" });
}

export function register(username: string, password: string): Promise<Session> {
  return request<{ id: number; username: string; token: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }).then((data) => ({ username: data.username, token: data.token }));
}

export function login(username: string, password: string): Promise<Session> {
  return request<{ id: number; username: string; token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }).then((data) => ({ username: data.username, token: data.token }));
}

export function currentUser(): Promise<{ id: number; username: string }> {
  return request<{ id: number; username: string }>("/api/auth/me");
}
