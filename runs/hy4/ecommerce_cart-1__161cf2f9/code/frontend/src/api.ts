export type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  is_active: boolean;
};

export type CartItem = {
  id: number;
  product_id: number;
  quantity: number;
  name: string;
  unit_price: number;
  line_total: number;
};

export type Cart = {
  items: CartItem[];
  subtotal: number;
};

export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};

export type Me = {
  id: number;
  username: string;
  is_admin: boolean;
};

let token: string | null = localStorage.getItem("shop_token");

export function getToken(): string | null {
  return token;
}

export function setToken(next: string | null): void {
  token = next;
  if (next) localStorage.setItem("shop_token", next);
  else localStorage.removeItem("shop_token");
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Network error. Please try again.", 0);
  }

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const message =
      (data as { message?: string; error?: string } | null)?.message ??
      (data as { error?: string } | null)?.error ??
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

function json(method: string, payload: unknown): RequestInit {
  return { method, body: JSON.stringify(payload) };
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  me: () => request<Me>("/auth/me"),
  register: (username: string, password: string) =>
    request<{ token: string; username: string; is_admin: boolean }>(
      "/auth/register",
      json("POST", { username, password }),
    ),
  login: (username: string, password: string) =>
    request<{ token: string; username: string; is_admin: boolean }>(
      "/auth/login",
      json("POST", { username, password }),
    ),
  logout: () => request<{ signed_out: boolean }>("/auth/logout", json("POST", {})),
  products: (q: string, page: number, pageSize: number) =>
    request<ProductPage>(
      `/products?q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`,
    ),
  product: (id: number) => request<Product>(`/products/${id}`),
  cart: () => request<Cart>("/cart"),
  addToCart: (productId: number, quantity: number) =>
    request<Cart>("/cart", json("POST", { product_id: productId, quantity })),
  setQuantity: (itemId: number, quantity: number) =>
    request<Cart>(`/cart/${itemId}`, json("PATCH", { quantity })),
  removeItem: (itemId: number) =>
    request<Cart>(`/cart/${itemId}`, { method: "DELETE" }),
  adminProducts: () =>
    request<{ items: Product[]; total: number }>("/admin/products"),
  createProduct: (payload: {
    name: string;
    description: string;
    price: number;
    stock: number;
    is_active: boolean;
  }) => request<Product>("/admin/products", json("POST", payload)),
  updateProduct: (
    id: number,
    payload: Partial<{
      name: string;
      description: string;
      price: number;
      stock: number;
      is_active: boolean;
    }>,
  ) => request<Product>(`/admin/products/${id}`, json("PATCH", payload)),
};

export function money(value: number): string {
  return `$${value.toFixed(2)}`;
}
