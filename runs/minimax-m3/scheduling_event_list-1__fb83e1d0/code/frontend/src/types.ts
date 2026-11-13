export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  created_by: string;
}

export interface EventList {
  items: CalendarEvent[];
  total: number;
}

export interface Session {
  token: string;
  username: string;
}

export type ViewMode = "month" | "week" | "day";

export interface EventDraft {
  title: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
}
