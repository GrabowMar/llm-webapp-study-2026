export type Preview = {
  id: number;
  url: string;
  final_url: string;
  status_code: number;
  title: string;
  description: string;
  image_url: string;
  fetched_at: string;
};

export type PreviewPage = {
  items: Preview[];
  total: number;
  page: number;
  page_size: number;
};

export type Session = {
  token: string;
  username: string;
};
