export type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  is_active: boolean;
};

export type ProductPage = { items: Product[]; total: number; page: number; page_size: number };
export type CartItem = { id: number; product_id: number; quantity: number; name: string; unit_price: number; line_total: number };
export type Cart = { items: CartItem[]; subtotal: number };
export type User = { id: number; username: string; is_admin: boolean };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError("We couldn’t connect to the shop. Please try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.message || "Something went wrong. Please try again.", response.status);
  return data as T;
}

export const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
export const category = (product: Pick<Product, "description">) => product.description.split(" · ")[0] || "Everyday essentials";
export const description = (product: Pick<Product, "description">) => product.description.includes(" · ") ? product.description.split(" · ").slice(1).join(" · ") : product.description;
