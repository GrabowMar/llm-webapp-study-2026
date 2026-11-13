export interface ImageItem {
  id: number;
  filename: string;
  title: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  url: string;
  uploader: string;
}

export interface ImagePage {
  items: ImageItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuthenticatedUser {
  id: number;
  username: string;
}
