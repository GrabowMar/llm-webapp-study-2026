export interface EventItem {
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
  items: EventItem[];
  total: number;
}

export interface EventInput {
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
}

export type CalendarView = "month" | "week" | "day";
