import type { Coords, Session, Store, StoreInput } from "./types";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const message =
      typeof data.error === "string" ? data.error : `Request failed (${response.status}).`;
    const errors =
      data.errors && typeof data.errors === "object"
        ? (data.errors as Record<string, string>)
        : {};
    throw new ApiError(response.status, message, errors);
  }

  return data as T;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export type StoreQuery = {
  q?: string;
  coords?: Coords | null;
  radius?: number;
};

export async function listStores({ q, coords, radius }: StoreQuery): Promise<Store[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (coords) {
    params.set("lat", String(coords.lat));
    params.set("lng", String(coords.lng));
    if (radius !== undefined) params.set("radius", String(radius));
  }
  const query = params.toString();
  const data = await request<{ items: Store[] }>(`/stores${query ? `?${query}` : ""}`);
  return data.items ?? [];
}

export async function getStore(id: number): Promise<Store> {
  return request<Store>(`/stores/${id}`);
}

export async function login(username: string, password: string): Promise<Session> {
  const data = await request<{ token: string; username: string; is_admin: boolean }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) },
  );
  return { token: data.token, username: data.username, isAdmin: Boolean(data.is_admin) };
}

export async function register(username: string, password: string): Promise<Session> {
  const data = await request<{ token: string; username: string; is_admin: boolean }>(
    "/auth/register",
    { method: "POST", body: JSON.stringify({ username, password }) },
  );
  return { token: data.token, username: data.username, isAdmin: Boolean(data.is_admin) };
}

export async function currentUser(token: string): Promise<{ username: string; is_admin: boolean }> {
  const data = await request<{ user: { username: string; is_admin: boolean } }>("/auth/me", {
    headers: authHeaders(token),
  });
  return data.user;
}

export async function createStore(token: string, store: StoreInput): Promise<Store> {
  return request<Store>("/admin/stores", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(store),
  });
}

export async function updateStore(
  token: string,
  id: number,
  store: StoreInput,
): Promise<Store> {
  return request<Store>(`/admin/stores/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(store),
  });
}

export async function deleteStore(token: string, id: number): Promise<void> {
  await request<void>(`/admin/stores/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}
