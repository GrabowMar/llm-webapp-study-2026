export type Todo = {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
};

export type TodoPage = {
  items: Todo[];
  total: number;
  page: number;
  page_size: number;
  remaining: number;
};

export type TodoInput = {
  title?: string;
  description?: string | null;
  priority?: string;
  due_date?: string | null;
  completed?: boolean;
};

export type ListParams = {
  completed?: boolean;
  priority?: string;
  page?: number;
  page_size?: number;
};
