export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  is_active: boolean;
}

export interface ProductsPage {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
}

export interface CartItem {
  id: number;
  product_id: number;
  quantity: number;
  name: string;
  unit_price: number;
  line_total: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
}

const TOKEN_KEY = "shop_token";
const USER_KEY = "shop_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setUsername(name: string | null) {
  if (name) {
    localStorage.setItem(USER_KEY, name);
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = {
  register: (username: string, password: string) =>
    request<{ id: number; username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  products: (q: string, page: number, pageSize: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    return request<ProductsPage>(`/products?${params.toString()}`);
  },

  cart: () => request<Cart>("/cart"),

  addToCart: (productId: number, quantity: number) =>
    request<CartItem>("/cart", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity }),
    }),

  updateCartItem: (itemId: number, quantity: number) =>
    request<CartItem>(`/cart/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    }),

  removeCartItem: (itemId: number) =>
    request<{ ok: boolean }>(`/cart/${itemId}`, { method: "DELETE" }),

  adminCreateProduct: (product: {
    name: string;
    description?: string;
    price: number;
    stock?: number;
    is_active?: boolean;
  }) =>
    request<Product>("/admin/products", {
      method: "POST",
      body: JSON.stringify(product),
    }),

  adminUpdateProduct: (
    id: number,
    fields: Partial<{
      name: string;
      description: string;
      price: number;
      stock: number;
      is_active: boolean;
    }>,
  ) =>
    request<Product>(`/admin/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    }),
};
