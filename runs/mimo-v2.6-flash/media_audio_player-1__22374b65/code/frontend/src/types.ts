export interface Track {
  id: number;
  title: string;
  artist: string;
  url: string;
  duration: number;
  play_count: number;
  created_at: string;
  added_by: string;
}

export interface TrackPage {
  items: Track[];
  total: number;
  page: number;
  page_size: number;
}

export interface LoginResponse {
  token: string;
}
