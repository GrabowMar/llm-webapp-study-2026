export interface Item {
  id: number;
  name: string;
  sku: string;
  location: string;
  quantity: number;
  reorder_level: number;
  low_stock: boolean;
}

export interface Movement {
  id: number;
  item_id: number;
  delta: number;
  reason: string;
  quantity_after: number;
  created_at: string;
  username: string;
}

export interface ItemPageResponse {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}

export interface MovementPageResponse {
  items: Movement[];
}

export interface ItemInput {
  name: string;
  sku: string;
  location: string;
  reorder_level: number;
}

export interface NewItemInput extends ItemInput {
  quantity: number;
}

export interface MovementInput {
  delta: number;
  reason: string;
}
