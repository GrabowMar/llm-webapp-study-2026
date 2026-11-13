import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, getToken, Priority, setToken, setUnauthorizedHandler, Todo } from "./api";
import AuthForm from "./AuthForm";
import TodoItem, { TodoFields } from "./TodoItem";

type Tab = "all" | "open" | "completed";
const PAGE_SIZE = 20;

function TodoList({ onSignedOut }: { onSignedOut: () => void }) {
  const [username, setUsername] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState<Priority | "">("");
  const [items, setItems] = useState<Todo[]>([]);
  const [page, setPage] = useState(1);
  const [remaining, setRemaining] = useState(0);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [addFields, setAddFields] = useState<Record<string, string>>({});
  const [addMessage, setAddMessage] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const seq = useRef(0);

  const completedFilter = tab === "all" ? undefined : tab === "completed";

  const reload = useCallback(
    async (upToPage: number) => {
      const my = ++seq.current;
      try {
        let all: Todo[] = [];
        let last = null;
        for (let p = 1; p <= upToPage; p++) {
          const res = await api.list({ completed: completedFilter, priority, page: p, page_size: PAGE_SIZE });
          if (my !== seq.current) return;
          all = all.concat(res.items);
          last = res;
          if (res.remaining === 0) break;
        }
        const open = await api.list({ completed: false, page: 1, page_size: 1 });
        if (my !== seq.current) return;
        setItems(all);
        setPage(last ? last.page : 1);
        setRemaining(last ? last.remaining : 0);
        setOpenCount(open.total);
        setLoadError("");
      } catch (err) {
        if (my === seq.current) setLoadError(err instanceof ApiError ? err.message : "Failed to load todos");
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [completedFilter, priority],
  );

  useEffect(() => {
    api.me().then((u) => setUsername(u.username)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    reload(1);
  }, [reload]);

  async function loadMore() {
    const my = ++seq.current;
    try {
      const res = await api.list({ completed: completedFilter, priority, page: page + 1, page_size: PAGE_SIZE });
      if (my !== seq.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return prev.concat(res.items.filter((t) => !seen.has(t.id)));
      });
      setPage(res.page);
      setRemaining(res.remaining);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load todos");
    }
  }

  async function add(v: { title: string; description: string | null; priority: Priority; due_date: string | null }) {
    setAddBusy(true);
    setAddFields({});
    setAddMessage("");
    try {
      await api.create(v);
      setAddKey((k) => k + 1);
      await reload(page);
    } catch (err) {
      if (err instanceof ApiError) {
        setAddFields(err.fields);
        if (Object.keys(err.fields).length === 0) setAddMessage(err.message);
      } else setAddMessage("Something went wrong");
    } finally {
      setAddBusy(false);
    }
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    onSignedOut();
  }

  const tabs: [Tab, string][] = [
    ["all", "All"],
    ["open", "Open"],
    ["completed", "Completed"],
  ];

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Todos</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600" data-testid="username">
            {username}
          </span>
          <button
            onClick={signOut}
            className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-medium text-slate-700">Add a todo</h2>
        <TodoFields
          key={addKey}
          fields={addFields}
          message={addMessage}
          busy={addBusy}
          submitLabel="Add"
          onSubmit={add}
        />
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex overflow-hidden rounded-md border border-slate-300 bg-white text-sm">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 ${tab === key ? "bg-indigo-600 text-white" : "hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by priority"
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
        >
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <span className="ml-auto text-sm text-slate-600" data-testid="open-count">
          {openCount === null ? "" : `${openCount} open`}
        </span>
      </div>

      {loadError && <p className="mb-2 text-sm text-red-600">{loadError}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-slate-500">No todos here.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <TodoItem key={t.id} todo={t} onChanged={() => reload(page)} />
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100"
          >
            Load more ({remaining} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(() => getToken() !== null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setSignedIn(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {signedIn ? (
        <TodoList
          onSignedOut={() => {
            setToken(null);
            setSignedIn(false);
          }}
        />
      ) : (
        <AuthForm onSignedIn={() => setSignedIn(true)} />
      )}
    </div>
  );
}
