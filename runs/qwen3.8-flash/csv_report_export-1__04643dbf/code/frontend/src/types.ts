export interface Entry {
  id: number;
  project: string;
  description: string;
  hours: number;
  date: string;
  created_at: string;
}

export interface EntryPage {
  items: Entry[];
  total: number;
  page: number;
  page_size: number;
}

export interface Filters {
  start_date: string;
  end_date: string;
  project: string;
}

export interface SummaryItem {
  project: string;
  hours: number;
}

export interface Summary {
  items: SummaryItem[];
  total_hours: number;
}

export type EntryInput = Pick<Entry, "project" | "description" | "hours" | "date">;
