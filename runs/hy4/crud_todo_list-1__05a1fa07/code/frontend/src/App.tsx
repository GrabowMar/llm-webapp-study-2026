import { useCallback, useEffect, useState } from "react";
import { ApiError, getToken, getUsername, listTodos, logout } from "./api";
import AddTodoForm from "./AddTodoForm";
import AuthScreen from "./AuthScreen";
import TodoRow, { isOverdue } from "./TodoRow";
import type { Tab, Todo } from "./types";

const PAGE_SIZE = 10;
const tabs: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
];
const priorities = [
  { value: "", label: "All priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function App() {
  const [signedIn, setSignedIn] = useState(!!getToken());
  const [username, setUsername] = useState(getUsername() ?? "");
  const [sessionMessage, setSessionMessage] = useState("");

  function handleUnauthorized() {
    logout();
    setSignedIn(false);
    setUsername("");
    setSessionMessage("Your session has expired. Please sign in again.");
  }

  useEffect(() => {
    window.addEventListener("todo:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("todo:unauthorized", handleUnauthorized);
  }, []);

  if (!signedIn) {
    return (
      <>
        <AuthScreen
          onSignedIn={(name) => {
            setUsername(name);
            setSessionMessage("");
            setSignedIn(true);
          }}
        />
        {sessionMessage && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">
            {sessionMessage}
          </div>
        )}
      </>
    );
  }

  return <TodoApp username={username} onSignedOut={handleUnauthorized} />;
}

function TodoApp({ username, onSignedOut }: { username: string; onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState("");
  const [items, setItems] = useState<Todo[]>([]);
  const [loadedPages, setLoadedPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [listKey, setListKey] = useState(0);
  const [counterKey, setCounterKey] = useState(0);

  const completedFilter = tab === "all" ? undefined : tab === "completed";

  const load = useCallback(
    async (page: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const result = await listTodos({
          completed: completedFilter,
          priority: priority || undefined,
          page,
          page_size: PAGE_SIZE,
        });
        setItems((current) => (append ? [...current, ...result.items] : result.items));
        setTotal(result.total);
        setRemaining(result.remaining);
        setLoadedPages(page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load todos.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [completedFilter, priority],
  );

  useEffect(() => {
    void load(1, false);
  }, [load, listKey]);

  useEffect(() => {
    let cancelled = false;
    setOpenCount(null);
    void listTodos({ completed: false, page: 1, page_size: 1 })
      .then((result) => {
        if (!cancelled) setOpenCount(result.total);
      })
      .catch(() => {
        if (!cancelled) setOpenCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [counterKey]);

  const refreshList = () => setListKey((key) => key + 1);
  const refreshCounter = () => setCounterKey((key) => key + 1);

  const overdueCount = items.filter(isOverdue).length;

  function handleUpdated(updated: Todo) {
    setItems((current) => current.map((todo) => (todo.id === updated.id ? updated : todo)));
    refreshCounter();
    const movedOut =
      (tab === "open" && updated.completed) || (tab === "completed" && !updated.completed);
    if (movedOut) refreshList();
  }

  function handleDeleted(id: number) {
    setItems((current) => current.filter((todo) => todo.id !== id));
    setTotal((value) => Math.max(0, value - 1));
    setRemaining((value) => Math.max(0, value - 1));
    refreshList();
    refreshCounter();
  }

  function handleCreated() {
    refreshList();
    refreshCounter();
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Todos</h1>
            <p className="text-xs text-slate-500">
              Signed in as <span className="font-medium text-slate-700">{username}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onSignedOut}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-2xl font-bold text-indigo-600">{openCount ?? "—"}</p>
              <p className="text-xs font-medium text-slate-500">open todos</p>
            </div>
            {overdueCount > 0 && (
              <div className="border-l border-slate-200 pl-4">
                <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
                <p className="text-xs font-medium text-slate-500">overdue</p>
              </div>
            )}
            <div className="border-l border-slate-200 pl-4">
              <p className="text-2xl font-bold text-slate-700">{total}</p>
              <p className="text-xs font-medium text-slate-500">shown</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-slate-200/70 p-1">
            {tabs.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTab(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === option.value ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            aria-label="Filter by priority"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            {priorities.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <AddTodoForm onCreated={handleCreated} />

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
            <button type="button" onClick={refreshList} className="ml-3 font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="rounded-xl bg-white py-12 text-center text-sm text-slate-500 ring-1 ring-slate-200">
            Loading todos…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl bg-white py-12 text-center ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-700">No todos here yet.</p>
            <p className="mt-1 text-xs text-slate-500">Add one above or try another filter.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((todo) => (
              <TodoRow key={todo.id} todo={todo} onUpdated={handleUpdated} onDeleted={handleDeleted} />
            ))}
          </ul>
        )}

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => void load(loadedPages + 1, true)}
            disabled={loadingMore}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-indigo-700 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : `Load more (${remaining} remaining)`}
          </button>
        )}
      </main>
    </div>
  );
}
