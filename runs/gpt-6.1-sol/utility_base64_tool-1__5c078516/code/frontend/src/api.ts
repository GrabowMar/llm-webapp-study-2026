export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("Unable to reach the server. Check your connection and try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error || "Something went wrong. Please try again.", response.status);
  return body as T;
}

export type Session = { token: string; username: string };
export type Direction = "encode" | "decode";
export type Conversion = {
  id: number;
  direction: Direction;
  input_preview: string;
  output_preview: string;
  created_at: string;
};
export type HistoryPage = { items: Conversion[]; total: number; page: number; page_size: number };

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
