import { createApi, ApiError } from "./api";
import type { Priority, Status, Task, TaskList } from "./types";

export const STATUSES: Status[] = ["todo", "in_progress", "done"];
export const PRIORITIES: Priority[] = ["low", "medium", "high"];

export const STATUS_LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-red-100 text-red-700",
};

const TOKEN_KEY = "kanban_token";
const USER_KEY = "kanban_username";

export class BoardStore {
  token: string | null;
  username: string | null;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
    this.username = localStorage.getItem(USER_KEY);
  }

  get api() {
    return createApi(this.token);
  }

  setAuth(token: string | null, username: string | null) {
    this.token = token;
    this.username = username;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, username ?? "");
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  async login(username: string, password: string) {
    const res = await this.api.login(username, password);
    this.setAuth(res.token, res.username);
    return res;
  }

  async register(username: string, password: string) {
    return this.api.register(username, password);
  }

  signOut() {
    this.setAuth(null, null);
  }

  async loadTasks(priority: string | null): Promise<TaskList> {
    return this.api.listTasks(priority ? { priority } : undefined);
  }

  async createTask(input: { title: string; description: string; status: Status; priority: Priority }) {
    return this.api.createTask(input);
  }

  async updateTask(id: number, patch: Partial<Task>) {
    return this.api.updateTask(id, patch);
  }

  async deleteTask(id: number) {
    return this.api.deleteTask(id);
  }
}

export type { ApiError, Task };
