export type Status = "todo" | "in_progress" | "done";

export type Priority = "low" | "medium" | "high";

export interface Task {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  position: number;
  updated_at: string;
}

export interface TaskList {
  items: Task[];
  total: number;
  counts: Record<Status, number>;
}

export interface TaskValues {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
}

export const STATUS_ORDER: Status[] = ["todo", "in_progress", "done"];

export const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const PRIORITY_ORDER: Priority[] = ["low", "medium", "high"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const EMPTY_COUNTS: Record<Status, number> = {
  todo: 0,
  in_progress: 0,
  done: 0,
};
