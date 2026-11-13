import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { PRIORITY_OPTIONS, priorityLabel } from "../lib/format";
import type { ListParams, Todo, TodoInput } from "../types";
import { AddTodoForm } from "./AddTodoForm";
import { TodoRow } from "./TodoRow";

type Props = {
  token: string;
  username: string;
  onSignOut: () => void;
};

type Tab = "all" | "open" | "completed";

const PAGE_SIZE = 10;

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "completed", label: "Completed" },
];

export function TodoBoard({ token, username, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState<string>("");
  const [items, setItems] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [pages, setPages] = useState(1);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  const query = useMemo<ListParams>(() => {
    const params: ListParams = { page: 1, page_size: PAGE_SIZE };
    if (tab === "open") {
      params.completed = false;
    }
    if (tab === "completed") {
      params.completed = true;
    }
    if (priority) {
      params.priority = priority;
    }
    return params;
  }, [tab, priority]);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    },
    [onSignOut],
  );

  const reload = useCallback(
    async (pageCount: number) => {
      setLoading(true);
      setError("");
      try {
        const results = await Promise.all(
          Array.from({ length: pageCount }, (_unused, index) =>
            api.listTodos(token, { ...query, page: index + 1 }),
          ),
        );
        const merged = results.flatMap((result) => result.items);
        setItems(merged);
        setTotal(results[0].total);
        setRemaining(Math.max(0, results[0].total - merged.length));
        setPages(pageCount);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [token, query, handleError],
  );

  useEffect(() => {
    void reload(1);
  }, [reload]);

  useEffect(() => {
    let active = true;
    api
      .listTodos(token, { completed: false, page: 1, page_size: 1 })
      .then((result) => {
        if (active) {
          setOpenCount(result.total);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token, version]);

  const refreshOpenCount = () => setVersion((current) => current + 1);

  const loadMore = async () => {
    setLoadingMore(true);
    setError("");
    try {
      const result = await api.listTodos(token, { ...query, page: pages + 1 });
      setItems((current) => [...current, ...result.items]);
      setTotal(result.total);
      setRemaining(result.remaining);
      setPages(pages + 1);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const createTodo = async (input: TodoInput) => {
    await api.createTodo(token, input);
    await reload(pages);
    refreshOpenCount();
  };

  const toggleTodo = async (todo: Todo) => {
    await api.updateTodo(token, todo.id, { completed: !todo.completed });
    await reload(pages);
    refreshOpenCount();
  };

  const updateTodo = async (id: number, patch: TodoInput) => {
    await api.updateTodo(token, id, patch);
    await reload(pages);
    refreshOpenCount();
  };

  const deleteTodo = async (todo: Todo) => {
    await api.deleteTodo(token, todo.id);
    await reload(pages);
    refreshOpenCount();
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
              ✓
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Todo List</h1>
              <p className="text-sm text-slate-500">
                Signed in as <span className="font-medium text-slate-700">{username}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            Sign out
          </button>
        </header>

        <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-slate-600">
            <span className="text-2xl font-semibold text-indigo-600">{openCount}</span>{" "}
            <span className="font-medium">{openCount === 1 ? "todo" : "todos"}</span> still open
            <span className="text-slate-400"> · {total} shown by this filter</span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-pressed={tab === entry.id}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                    tab === entry.id
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <label htmlFor="priority-filter" className="sr-only">
              Filter by priority
            </label>
            <select
              id="priority-filter"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">All priorities</option>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {priorityLabel(option)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <AddTodoForm onCreate={createTodo} />

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-center text-sm text-slate-500">Loading todos…</p>
        ) : items.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-sm text-slate-500">
            Nothing here yet. Add your first todo above.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onToggle={toggleTodo}
                onUpdate={updateTodo}
                onDelete={deleteTodo}
              />
            ))}
          </ul>
        )}

        {remaining > 0 ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : `Load more (${remaining} remaining)`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
