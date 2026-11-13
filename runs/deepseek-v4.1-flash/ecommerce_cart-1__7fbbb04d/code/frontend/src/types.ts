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

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export function money(value: number): string {
  return `$${value.toFixed(2)}`;
}
