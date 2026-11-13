export type User = {
  id: number;
  username: string;
  is_admin: boolean;
};

export type Post = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author: string;
  excerpt: string;
  taken_down: boolean;
};

export type PostList = {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
};
