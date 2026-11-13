export interface Preview {
  id: number;
  url: string;
  final_url: string;
  status_code: number | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  fetched_at: string;
}

export interface PreviewPage {
  items: Preview[];
  total: number;
  page: number;
  page_size: number;
}

export interface Session {
  token: string;
  username: string;
}
