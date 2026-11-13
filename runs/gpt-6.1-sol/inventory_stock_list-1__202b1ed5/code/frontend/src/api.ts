export type Item = {
  id: number;
  name: string;
  sku: string;
  location: string;
  quantity: number;
  reorder_level: number;
  low_stock: boolean;
};

export type Movement = {
  id: number;
  item_id: number;
  delta: number;
  reason: string;
  quantity_after: number;
  created_at: string;
  username: string;
  name?: string;
  sku?: string;
};

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };
export type Overview = {
  total_items: number;
  total_units: number;
  low_stock: number;
  locations: { location: string; item_count: number; total_units: number; low_stock: number }[];
};

export class ApiError extends Error {
  errors: Record<string, string>;
  status: number;

  constructor(message: string, errors: Record<string, string>, status: number) {
    super(message);
    this.errors = errors;
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("stockroom-token");
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "Something went wrong. Please try again.", data.errors || {}, response.status);
  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export const number = (value: number) => value.toLocaleString();
