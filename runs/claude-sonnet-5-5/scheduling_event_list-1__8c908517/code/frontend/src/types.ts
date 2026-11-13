export interface CalEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
  created_at: string;
  created_by: string;
}

export interface EventInput {
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
}

export type ViewMode = "month" | "week" | "day";

export interface Session {
  token: string;
  username: string;
}
