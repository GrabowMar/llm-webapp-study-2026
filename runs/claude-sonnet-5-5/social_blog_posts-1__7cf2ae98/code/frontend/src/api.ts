export type Post = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author: string;
  excerpt: string;
  taken_down?: boolean;
};

export type PostList = {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
};

export type PostInput = { title: string; content: string; tags: string[] };

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

const TOKEN_KEY = "blog_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error");
  }
  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.errors || {});
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("POST", "/auth/register", { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string }>("POST", "/auth/login", { username, password }),
  me: () => request<{ username: string; is_admin: boolean }>("GET", "/auth/me"),
  listPosts: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    return request<PostList>("GET", `/posts?${qs}`);
  },
  getPost: (id: string | number) => request<Post>("GET", `/posts/${id}`),
  createPost: (p: PostInput) => request<Post>("POST", "/posts", p),
  updatePost: (id: number, p: PostInput) => request<Post>("PUT", `/posts/${id}`, p),
  deletePost: (id: number) => request<void>("DELETE", `/posts/${id}`),
  toggle: (id: number) => request<Post>("POST", `/admin/posts/${id}/toggle`),
};
