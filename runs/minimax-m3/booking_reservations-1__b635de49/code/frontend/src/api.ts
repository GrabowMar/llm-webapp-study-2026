export type Reservation = {
  id: number;
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string;
  created_at: string;
};

export type AvailabilityItem = {
  time: string;
  booked: number;
  remaining: number;
};

export type User = {
  id: number;
  username: string;
  is_admin: boolean;
};

export type ReservationInput = {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_STORAGE_KEY = "table-reservations.token";

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable - the session simply will not persist */
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const fromBody =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "";
    const message = fromBody || `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export async function register(username: string, password: string): Promise<User> {
  return request<User>("/api/auth/register", { method: "POST", body: { username, password } });
}

export async function login(username: string, password: string): Promise<{ token: string; username: string; is_admin: boolean }> {
  return request<{ token: string; username: string; is_admin: boolean }>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export async function logout(): Promise<void> {
  try {
    await request<{ status: string }>("/api/auth/logout", { method: "POST" });
  } catch {
    /* the token is dropped locally regardless */
  }
}

export async function fetchMe(): Promise<User> {
  return request<User>("/api/auth/me");
}

export async function fetchReservations(date?: string): Promise<{ items: Reservation[]; total: number }> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<{ items: Reservation[]; total: number }>(`/api/reservations${query}`);
}

export async function createReservation(input: ReservationInput): Promise<Reservation> {
  return request<Reservation>("/api/reservations", { method: "POST", body: input });
}

export async function updateReservation(id: number, input: ReservationInput): Promise<Reservation> {
  return request<Reservation>(`/api/reservations/${id}`, { method: "PUT", body: input });
}

export async function deleteReservation(id: number): Promise<void> {
  await request<{ status: string }>(`/api/reservations/${id}`, { method: "DELETE" });
}

export async function fetchAvailability(date: string): Promise<{ items: AvailabilityItem[] }> {
  return request<{ items: AvailabilityItem[] }>(`/api/availability?date=${encodeURIComponent(date)}`);
}

export async function fetchAdminReservations(
  date: string,
  page: number,
  pageSize: number,
): Promise<{ items: Reservation[]; total: number; page: number; page_size: number }> {
  const query = `?date=${encodeURIComponent(date)}&page=${page}&page_size=${pageSize}`;
  return request<{ items: Reservation[]; total: number; page: number; page_size: number }>(
    `/api/admin/reservations${query}`,
  );
}

export async function fetchAllAdminReservations(date: string): Promise<Reservation[]> {
  const pageSize = 100;
  const collected: Reservation[] = [];
  let page = 1;
  let total = 0;
  let fetched = 0;
  for (;;) {
    const data = await fetchAdminReservations(date, page, pageSize);
    collected.push(...data.items);
    total = data.total;
    fetched = data.items.length;
    if (collected.length >= total || fetched === 0) break;
    page += 1;
  }
  return collected;
}
