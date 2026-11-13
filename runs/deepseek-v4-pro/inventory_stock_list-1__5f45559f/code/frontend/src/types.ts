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

export interface ItemListResponse {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}

export interface MovementListResponse {
  items: Movement[];
}
