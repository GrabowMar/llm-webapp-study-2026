export interface Link {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
  short_url: string;
  owner: string;
  active?: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
