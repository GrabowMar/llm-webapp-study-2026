export type ValidationResult = {
  valid: boolean;
  error: string | null;
  line: number | null;
  column: number | null;
  root_element: string | null;
};

export type SavedCheck = ValidationResult & {
  id: number;
  xml_preview: string;
  created_at: string;
};

export type ValidationPage = {
  items: SavedCheck[];
  total: number;
  page: number;
  page_size: number;
};

export async function api<T>(
  path: string,
  init: RequestInit = {},
  token: string | null = null,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
  }
  return data as T;
}
