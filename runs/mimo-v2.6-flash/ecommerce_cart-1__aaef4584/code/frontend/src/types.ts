export type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  is_active: boolean;
};

export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
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

export type User = {
  username: string;
  isAdmin: boolean;
};
