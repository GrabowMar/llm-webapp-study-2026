export type Track = {
  id: number;
  title: string;
  artist: string;
  url: string;
  duration: number | string | null;
  play_count: number;
  created_at: string;
  added_by: string | null;
};

export type TrackPage = {
  items: Track[];
  total: number;
  page: number;
  page_size: number;
};

export type User = {
  id: number;
  username: string;
};

export type AuthResponse = {
  token: string;
  id: number;
  username: string;
};

export type TrackDraft = {
  title: string;
  artist: string;
  url: string;
  duration: string;
};
