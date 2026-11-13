import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  listTodos,
  logout,
  type ListParams,
  type Todo,
} from "../api";
import AddTodoForm from "./AddTodoForm";
import TodoItem, { PRIORITIES } from "./TodoItem";

const PAGE_SIZE = 10;

type Tab = "all" | "open" | "completed";

interface Props {
  username: string;
  onSignOut: () => void;
}

export default function TodoApp({ username, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState("");
  const [items, setItems] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [remaining, setRemaining] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const requestId = useRef(0);

  const buildParams = useCallback(
    (targetPage: number, pageSize: number): ListParams => ({
      completed: tab === "open" ? false : tab === "completed" ? true : undefined,
      priority: priority || undefined,
      page: targetPage,
      page_size: pageSize,
    }),
    [tab, priority],
  );

  const handleUnauthorized = useCallback(() => {
    onSignOut();
  }, [onSignOut]);

  const refreshOpenCount = useCallback(async () => {
    try {
      const result = await listTodos({ completed: false, page: 1, page_size: 1 });
      setOpenCount(result.total);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
      }
    }
  }, [handleUnauthorized]);

  const loadFirstPage = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await listTodos(buildParams(1, PAGE_SIZE));
      if (id !== requestId.current) {
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      setPage(1);
      setRemaining(result.remaining);
    } catch (caught) {
      if (id !== requestId.current) {
        return;
      }
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(
        caught instanceof ApiError ? caught.message : "Unable to load todos.",
      );
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  }, [buildParams, handleUnauthorized]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    void refreshOpenCount();
  }, [refreshOpenCount]);

  const refreshLoaded = useCallback(async () => {
    const id = ++requestId.current;
    const pagesLoaded = Math.max(page, 1);
    try {
      const result = await listTodos(buildParams(1, PAGE_SIZE * pagesLoaded));
      if (id !== requestId.current) {
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      setPage(pagesLoaded);
      setRemaining(Math.max(result.total - result.items.length, 0));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(
        caught instanceof ApiError ? caught.message : "Unable to refresh todos.",
      );
    }
    void refreshOpenCount();
  }, [buildParams, page, handleUnauthorized, refreshOpenCount]);

  async function loadMore() {
    setLoadingMore(true);
    setError("");
    const nextPage = page + 1;
    try {
      const result = await listTodos(buildParams(nextPage, PAGE_SIZE));
      setItems((current) => [...current, ...result.items]);
      setTotal(result.total);
      setPage(nextPage);
      setRemaining(result.remaining);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(
        caught instanceof ApiError ? caught.message : "Unable to load more todos.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const handleCreated = useCallback(() => {
    void loadFirstPage();
    void refreshOpenCount();
  }, [loadFirstPage, refreshOpenCount]);

  const handleChanged = useCallback(() => {
    void refreshLoaded();
  }, [refreshLoaded]);

  const handleDeleted = useCallback(() => {
    void refreshLoaded();
  }, [refreshLoaded]);

  async function handleSignOut() {
    try {
      await logout();
    } catch {
      // Ignore network errors while signing out.
    }
    onSignOut();
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "completed", label: "Completed" },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Todo List</h1>
            <p className="text-xs text-slate-500">
              Signed in as <span className="font-medium text-slate-700">{username}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
              {openCount} open
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <AddTodoForm onCreated={handleCreated} onUnauthorized={handleUnauthorized} />

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            {tabs.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === entry.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="priority-filter" className="text-xs font-medium text-slate-600">
              Priority
            </label>
            <select
              id="priority-filter"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">Any</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading todos…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-700">No todos here</p>
            <p className="mt-1 text-sm text-slate-500">
              {tab === "completed"
                ? "Complete a todo to see it here."
                : "Add your first todo above."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onChanged={handleChanged}
                onDeleted={handleDeleted}
                onUnauthorized={handleUnauthorized}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-col items-center gap-2 pb-8">
          <p className="text-xs text-slate-500">
            Showing {items.length} of {total}
            {remaining > 0 ? ` · ${remaining} remaining` : ""}
          </p>
          {remaining > 0 && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
