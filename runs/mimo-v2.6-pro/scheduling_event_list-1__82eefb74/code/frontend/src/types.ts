export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
  created_at: string;
  created_by: string;
}

export interface EventPayload {
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
}

export type ViewMode = "month" | "week" | "day";

export type DialogState =
  | { kind: "view"; event: CalendarEvent }
  | { kind: "create"; dateKey: string }
  | { kind: "edit"; event: CalendarEvent };
