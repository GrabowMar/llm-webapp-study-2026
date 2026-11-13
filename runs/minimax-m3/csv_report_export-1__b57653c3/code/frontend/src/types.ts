export interface Entry {
  id: number;
  project: string;
  description: string;
  hours: number;
  date: string;
  created_at: string;
}

export interface EntriesResponse {
  items: Entry[];
  total: number;
  page: number;
  page_size: number;
}

export interface SummaryItem {
  project: string;
  hours: number;
}

export interface EntryFilters {
  start_date: string;
  end_date: string;
  project: string;
}

export interface EntryInput {
  project: string;
  description: string;
  hours: string;
  date: string;
}

export interface Session {
  token: string;
  username: string;
}
