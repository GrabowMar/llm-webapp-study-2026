export type Entry = {
  id: number;
  project: string;
  description: string;
  hours: number;
  date: string;
  created_at: string;
};

export type Filters = {
  start_date: string;
  end_date: string;
  project: string;
};

export type ApiError = {
  error?: string;
  errors?: Record<string, string>;
};

export const emptyFilters: Filters = {
  start_date: "",
  end_date: "",
  project: "",
};

export const today = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export function filterParams(filters: Filters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.project) params.set("project", filters.project);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return params.toString();
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public data: ApiError = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}) as T);
  if (!response.ok) {
    const error = data as ApiError;
    const message =
      error.error ??
      (error.errors ? Object.values(error.errors).join(" ") : null) ??
      `Request failed (${response.status}).`;
    throw new ApiRequestError(message, error);
  }
  return data as T;
}

export class Api {
  constructor(
    private token: string,
    private onAuthError: () => void,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(path, { ...init, headers });
    if (response.status === 401) {
      this.onAuthError();
      throw new Error("Your session expired. Please sign in again.");
    }
    return parseJson<T>(response);
  }

  async entries(filters: Filters, page: number, pageSize: number) {
    const query = filterParams(filters, {
      page: String(page),
      page_size: String(pageSize),
    });
    return this.request<{
      items: Entry[];
      total: number;
      page: number;
      page_size: number;
    }>(`/api/entries?${query}`);
  }

  async createEntry(fields: {
    project: string;
    description: string;
    hours: string;
    date: string;
  }) {
    return this.request<Entry>("/api/entries", {
      method: "POST",
      body: JSON.stringify({ ...fields, hours: Number(fields.hours) }),
    });
  }

  async updateEntry(id: number, fields: Partial<Entry>) {
    return this.request<Entry>(`/api/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  }

  async deleteEntry(id: number) {
    return this.request<{ deleted: boolean }>(`/api/entries/${id}`, {
      method: "DELETE",
    });
  }

  async projects() {
    return this.request<{ items: string[] }>("/api/projects");
  }

  async summary(filters: Filters) {
    return this.request<{
      items: { project: string; hours: number }[];
      total_hours: number;
    }>(`/api/summary?${filterParams(filters)}`);
  }

  async download(path: string, filename: string) {
    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (response.status === 401) {
      this.onAuthError();
      throw new Error("Your session expired. Please sign in again.");
    }
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}).`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export async function authRequest(path: string, username: string, password: string) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return parseJson<{ token?: string }>(response);
}
