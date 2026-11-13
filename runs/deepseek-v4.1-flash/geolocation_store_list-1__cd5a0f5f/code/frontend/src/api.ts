export type Store = {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  distance_km: number | null;
};

export type StoreInput = {
  name: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
};

export class ApiError extends Error {
  status: number;
  errors: Record<string, string>;

  constructor(message: string, status: number, errors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as {
      error?: string;
      errors?: Record<string, string>;
    };
    throw new ApiError(
      body.error ?? `Request failed (${response.status})`,
      response.status,
      body.errors ?? {},
    );
  }

  return payload as T;
}

export function listStores(params: {
  q?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}): Promise<{ items: Store[] }> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.lat !== undefined && params.lng !== undefined) {
    query.set("lat", String(params.lat));
    query.set("lng", String(params.lng));
    if (params.radius !== undefined) query.set("radius", String(params.radius));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request(`/api/stores${suffix}`);
}

export function login(username: string, password: string): Promise<{ token: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

function adminOptions(method: string, token: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function createStore(token: string, input: StoreInput): Promise<Store> {
  return request("/api/admin/stores", adminOptions("POST", token, input));
}

export function updateStore(
  token: string,
  id: number,
  input: StoreInput,
): Promise<Store> {
  return request(`/api/admin/stores/${id}`, adminOptions("PUT", token, input));
}

export function deleteStore(token: string, id: number): Promise<void> {
  return request(`/api/admin/stores/${id}`, adminOptions("DELETE", token));
}
