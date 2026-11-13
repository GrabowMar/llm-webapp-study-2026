export type Session = { token: string; username: string };

export type Preview = {
  id: number;
  url: string;
  final_url: string;
  status_code: number;
  title: string;
  description: string;
  image_url: string | null;
  fetched_at: string;
};

export type PreviewPage = {
  items: Preview[];
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

export async function api<T>(
  path: string,
  options: { token?: string; method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      signal: options.signal,
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Could not connect. Check your connection and try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && options.token) window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(data?.error ?? "Something went wrong. Please try again.", response.status);
  }
  return data as T;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem("marginal-token");
  } catch {
    return null;
  }
}

export function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem("marginal-token", token);
    else localStorage.removeItem("marginal-token");
  } catch {
    return;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web link";
  }
}

export function safeWebUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
