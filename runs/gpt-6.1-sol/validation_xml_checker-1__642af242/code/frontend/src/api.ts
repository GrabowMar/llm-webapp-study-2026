export type Validation = {
  valid: boolean;
  error: string | null;
  line: number | null;
  column: number | null;
  root_element: string | null;
};

export type SavedValidation = Validation & {
  id: number;
  xml_preview: string;
  created_at: string;
};

export type HistoryPage = {
  items: SavedValidation[];
  total: number;
  page: number;
  page_size: number;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "Something went wrong. Please try again.", response.status);
  return data as T;
}
