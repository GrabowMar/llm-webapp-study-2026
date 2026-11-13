export type Link = {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
  short_url: string;
  owner: string;
  owner_id?: number;
  is_active?: boolean;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type User = {
  id: number;
  username: string;
  is_admin: boolean;
};

export type LoginResponse = {
  token: string;
  user?: User;
};
