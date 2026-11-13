export type Sensor = {
  id: number;
  name: string;
  unit: string;
  location: string;
  last_value: number | null;
  last_updated: string | null;
  owner: string;
};

export type Reading = {
  id: number;
  sensor_id: number;
  value: number;
  recorded_at: string;
};

export type Session = { token: string; username: string };
export type View = "overview" | "all" | "mine";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Something went wrong. Please try again." }));
    throw new ApiError(body.error || "Unable to complete the request.", response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const numberFormat = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);

export function timeAgo(date: string | null) {
  if (!date) return "No readings yet";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function isRecent(sensor: Sensor) {
  return !!sensor.last_updated && Date.now() - new Date(sensor.last_updated).getTime() < 3600000;
}
