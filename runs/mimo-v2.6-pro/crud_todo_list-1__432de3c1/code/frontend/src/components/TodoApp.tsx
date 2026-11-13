import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTodo,
  deleteTodo,
  listTodos,
  toApiError,
  updateTodo,
} from "../api";
import type { Priority, Todo, TodoInput } from "../types";
import TodoForm from "./TodoForm";
import TodoItem from "./TodoItem";

const PAGE_SIZE = 10;
const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
] as const;

type Tab = (typeof TABS)[number]["key"];

function compareTodos(a: Todo, b: Todo): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  if (a.due_date && b.due_date && a.due_date !== b.due_date) {
    return a.due_date < b.due_date ? -1 : 1;
  }
  if (a.due_date && !b.due_date) return -1;
  if (!a.due_date && b.due_date) return 1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return b.id - a.id;
}

export default function TodoApp() {
  const [items, setItems] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const pageRef = useRef(1);
  const [remaining, setRemaining] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState<Priority | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCount = useCallback(async (priorityFilter: Priority | "") => {
    try {
      const data = await listTodos({
        completed: false,
        priority: priorityFilter,
        page: 1,
        pageSize: 1,
      });
      setOpenCount(data.total);
    } catch {
      setOpenCount(0);
    }
  }, []);

  const load = useCallback(async (reset: boolean, tabFilter: Tab, priorityFilter: Priority | "") => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTodos({
        completed: tabFilter === "all" ? undefined : tabFilter === "open" ? false : true,
        priority: priorityFilter,
        page: reset ? 1 : pageRef.current + 1,
        pageSize: PAGE_SIZE,
      });
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
      pageRef.current = data.page;
      setRemaining(data.remaining);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true, tab, priority);
    void refreshCount(priority);
  }, [tab, priority, load, refreshCount]);

  function showError(err: unknown) {
    setError(toApiError(err).message);
  }

  async function handleToggle(todo: Todo, completed: boolean) {
    setError(null);
    try {
      const updated = await updateTodo(todo.id, { completed });
      if (tab === "all") {
        setItems((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)).sort(compareTodos),
        );
      } else {
        await load(true, tab, priority);
      }
      void refreshCount(priority);
    } catch (err) {
      showError(err);
    }
  }

  async function handleCreate(input: TodoInput) {
    await createTodo(input);
    await load(true, tab, priority);
    void refreshCount(priority);
  }

  async function handleSave(id: number, input: TodoInput) {
    try {
      const updated = await updateTodo(id, input);
      setItems((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)).sort(compareTodos),
      );
      void refreshCount(priority);
    } catch (err) {
      throw toApiError(err);
    }
  }

  async function handleDelete(todo: Todo) {
    if (!window.confirm(`Delete "${todo.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteTodo(todo.id);
      await load(true, tab, priority);
      void refreshCount(priority);
    } catch (err) {
      showError(err);
    }
  }

  return (
    <div className="space-y-4">
      <TodoForm submitLabel="Add todo" onSubmit={handleCreate} resetOnSuccess />

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded border border-slate-200 bg-white p-1">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                tab === entry.key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-800">{openCount}</span>{" "}
        {openCount === 1 ? "open todo" : "open todos"}
        <span className="text-slate-400"> &middot; {total} shown</span>
      </p>

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      ) : (
        !loading && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No todos here.</p>
      )}

      {loading && <p className="text-center text-sm text-slate-500">Loading…</p>}

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => void load(false, tab, priority)}
          disabled={loading}
          className="w-full rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Load more ({remaining} more)
        </button>
      )}
    </div>
  );
}
