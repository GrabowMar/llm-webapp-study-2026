export type Store = {
  id: number;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  distance_km: number | null;
};

export type StoreDraft = {
  name: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
};

export const emptyDraft: StoreDraft = {
  name: "",
  address: "",
  phone: "",
  latitude: "",
  longitude: "",
};

export type ApiError = {
  errors?: Record<string, string>;
  error?: string;
};

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
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
    const err: ApiError = (data as ApiError) ?? {};
    throw { status: response.status, ...err } as ApiError & { status: number };
  }
  return data as T;
}

export async function getStores(params: {
  q?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}): Promise<Store[]> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.lat !== undefined && params.lng !== undefined) {
    search.set("lat", String(params.lat));
    search.set("lng", String(params.lng));
    if (params.radius !== undefined) search.set("radius", String(params.radius));
  }
  const suffix = search.toString();
  const result = await api<{ items: Store[] }>(`/api/stores${suffix ? `?${suffix}` : ""}`);
  return result.items;
}

export function draftToPayload(draft: StoreDraft) {
  return {
    name: draft.name,
    address: draft.address,
    phone: draft.phone,
    latitude: draft.latitude.trim() === "" ? null : Number(draft.latitude),
    longitude: draft.longitude.trim() === "" ? null : Number(draft.longitude),
  };
}

export function storeToDraft(store: Store): StoreDraft {
  return {
    name: store.name,
    address: store.address,
    phone: store.phone,
    latitude: String(store.latitude),
    longitude: String(store.longitude),
  };
}
