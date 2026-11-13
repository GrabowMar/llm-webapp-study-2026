export interface Post {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  author: string;
  excerpt: string;
}

export interface PostPage {
  items: Post[];
  total: number;
  page: number;
  page_size: number;
}

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface RegisterResponse {
  id: number;
  username: string;
  is_admin: boolean;
  user: User;
  token: string;
}

export interface PostInput {
  title: string;
  content: string;
  tags: string[];
}
