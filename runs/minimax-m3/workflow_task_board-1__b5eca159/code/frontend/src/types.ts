export type Status = "todo" | "in_progress" | "done";
export type Priority = "low" | "medium" | "high" | "urgent" | "critical" | "normal";
export type PriorityFilter = Priority | "all";

export interface Task {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  position: number;
  updated_at: string;
}

export interface TaskListResponse {
  items: Task[];
  total: number;
  counts: Record<Status, number>;
}

export interface AuthUser {
  id: number;
  username: string;
}
