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

export interface AuthState {
  token: string | null;
  username: string | null;
}
