export interface User {
  username: string;
  is_admin: boolean;
}

export interface Post {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author: string;
  excerpt: string;
  taken_down: boolean;
}

export interface PostList {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
}

export interface PostInput {
  title: string;
  content: string;
  tags: string[];
}

export interface ListParams {
  q?: string;
  tag?: string;
  author?: string;
  page?: number;
  page_size?: number;
}
