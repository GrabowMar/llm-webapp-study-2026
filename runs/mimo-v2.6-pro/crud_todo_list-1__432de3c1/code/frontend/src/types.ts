export type Priority = "low" | "medium" | "high";

export interface Todo {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface TodoPage {
  items: Todo[];
  total: number;
  page: number;
  page_size: number;
  remaining: number;
}

export interface TodoInput {
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
}
