import type { Auth, Cart, Product, ProductPage } from "./types";

export class ApiError extends Error {}

type FetchOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }
  if (!res.ok) {
    const err = data as { error?: unknown } | null;
    const message =
      err && typeof err.error === "string" ? err.error : `Request failed (${res.status})`;
    throw new ApiError(message);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/api/auth/register", {
      method: "POST",
      body: { username, password },
    }),

  login: async (username: string, password: string): Promise<Auth> => {
    const res = await request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    const me = await request<{ username: string; is_admin: boolean }>("/api/auth/me", {
      token: res.token,
    });
    return { token: res.token, username: me.username, isAdmin: me.is_admin };
  },

  me: (token: string) =>
    request<{ username: string; is_admin: boolean }>("/api/auth/me", { token }),

  logout: (token: string) => request<{ ok: boolean }>("/api/auth/logout", { method: "POST", token }),

  listProducts: (params: { q: string; page: number; pageSize: number }) => {
    const query = new URLSearchParams({
      q: params.q,
      page: String(params.page),
      page_size: String(params.pageSize),
    });
    return request<ProductPage>(`/api/products?${query}`);
  },

  getCart: (token: string) => request<Cart>("/api/cart", { token }),

  addToCart: (token: string, productId: number, quantity: number) =>
    request<Cart>("/api/cart", {
      method: "POST",
      token,
      body: { product_id: productId, quantity },
    }),

  setCartQuantity: (token: string, itemId: number, quantity: number) =>
    request<Cart>(`/api/cart/${itemId}`, { method: "PATCH", token, body: { quantity } }),

  removeCartItem: (token: string, itemId: number) =>
    request<Cart>(`/api/cart/${itemId}`, { method: "DELETE", token }),

  adminListProducts: (token: string) => request<Product[]>("/api/admin/products", { token }),

  adminCreateProduct: (
    token: string,
    product: { name: string; description: string; price: number; stock: number },
  ) => request<Product>("/api/admin/products", { method: "POST", token, body: product }),

  adminUpdateProduct: (
    token: string,
    id: number,
    patch: Partial<Pick<Product, "name" | "description" | "price" | "stock" | "is_active">>,
  ) => request<Product>(`/api/admin/products/${id}`, { method: "PATCH", token, body: patch }),
};
