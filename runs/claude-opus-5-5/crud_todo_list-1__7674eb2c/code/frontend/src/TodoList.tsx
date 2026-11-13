import { useCallback, useEffect, useRef, useState } from "react";
import TodoForm from "./TodoForm";
import TodoItem from "./TodoItem";
import { api, PRIORITIES, type Priority, type Todo, type TodoInput } from "./api";

const PAGE_SIZE = 10;

type Tab = "all" | "open" | "completed";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "completed", label: "Completed" },
];

function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function completedParam(tab: Tab) {
  return tab === "all" ? undefined : tab === "completed";
}

export default function TodoList() {
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState<Priority | "">("");
  const [items, setItems] = useState<Todo[]>([]);
  const [pagesLoaded, setPagesLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchPages = useCallback(
    async (pages: number) => {
      const id = ++requestId.current;
      const params = { completed: completedParam(tab), priority: priority || undefined, page_size: PAGE_SIZE };
      const results = await Promise.all(
        Array.from({ length: Math.max(pages, 1) }, (_, i) => api.listTodos({ ...params, page: i + 1 })),
      );
      if (id !== requestId.current) return;
      const seen = new Set<number>();
      const merged: Todo[] = [];
      for (const result of results) {
        for (const todo of result.items) {
          if (!seen.has(todo.id)) {
            seen.add(todo.id);
            merged.push(todo);
          }
        }
      }
      const last = results[results.length - 1];
      setItems(merged);
      setTotal(last.total);
      setRemaining(last.remaining);
      setPagesLoaded(Math.max(pages, 1));
      setError(null);
    },
    [tab, priority],
  );

  useEffect(() => {
    setLoading(true);
    fetchPages(1)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fetchPages]);

  const refresh = useCallback(() => fetchPages(pagesLoaded).catch((err: Error) => setError(err.message)), [fetchPages, pagesLoaded]);

  async function loadMore() {
    setLoadingMore(true);
    const id = ++requestId.current;
    try {
      const result = await api.listTodos({
        completed: completedParam(tab),
        priority: priority || undefined,
        page: pagesLoaded + 1,
        page_size: PAGE_SIZE,
      });
      if (id !== requestId.current) return;
      setItems((prev) => {
        const ids = new Set(prev.map((t) => t.id));
        return [...prev, ...result.items.filter((t) => !ids.has(t.id))];
      });
      setTotal(result.total);
      setRemaining(result.remaining);
      setPagesLoaded(pagesLoaded + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more todos.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCreate(input: TodoInput) {
    await api.createTodo(input);
    await refresh();
  }

  async function handleToggle(todo: Todo, completed: boolean) {
    setItems((prev) => prev.map((t) => (t.id === todo.id ? { ...t, completed } : t)));
    try {
      await api.updateTodo(todo.id, { completed });
    } finally {
      await refresh();
    }
  }

  async function handleUpdate(todo: Todo, input: TodoInput) {
    if (Object.keys(input).length > 0) await api.updateTodo(todo.id, input);
    await refresh();
  }

  async function handleDelete(todo: Todo) {
    await api.deleteTodo(todo.id);
    await refresh();
  }

  const today = localToday();
  const hasMore = items.length < total;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Add a todo</h2>
        <TodoForm submitLabel="Add" onSubmit={handleCreate} resetOnSuccess />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Filter by status">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="priority-filter" className="text-sm text-slate-500">
              Priority
            </label>
            <select
              id="priority-filter"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority | "")}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600" data-testid="remaining-count">
          <span className="font-semibold text-slate-900">{remaining}</span> open {remaining === 1 ? "todo" : "todos"}
        </p>

        {error && (
          <p role="alert" className="mx-4 my-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No todos here.</p>
        ) : (
          <ul>
            {items.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                today={today}
                onToggle={handleToggle}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}

        {!loading && hasMore && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
