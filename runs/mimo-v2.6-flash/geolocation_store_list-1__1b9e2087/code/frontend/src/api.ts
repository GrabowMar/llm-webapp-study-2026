export interface Store {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  distance_km: number | null;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

interface ApiFailure {
  error?: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const failure = (data ?? {}) as ApiFailure;
    throw new ApiError(
      response.status,
      failure.error ?? `Request failed (${response.status})`,
      failure.fields ?? {},
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, token?: string | null): Promise<T> =>
    call<T>("GET", path, undefined, token),
  post: <T>(path: string, body: unknown, token?: string | null): Promise<T> =>
    call<T>("POST", path, body, token),
  put: <T>(path: string, body: unknown, token?: string | null): Promise<T> =>
    call<T>("PUT", path, body, token),
  del: <T>(path: string, token?: string | null): Promise<T> =>
    call<T>("DELETE", path, undefined, token),
};

export function storesUrl(query: string, position: GeoPoint | null, radius: number): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed) params.set("q", trimmed);
  if (position) {
    params.set("lat", String(position.lat));
    params.set("lng", String(position.lng));
    params.set("radius", String(radius));
  }
  const suffix = params.toString();
  return suffix ? `/api/stores?${suffix}` : "/api/stores";
}
