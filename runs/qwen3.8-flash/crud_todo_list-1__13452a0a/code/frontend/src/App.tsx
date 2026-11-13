import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  createTodo,
  deleteTodo,
  fetchTodos,
  getUsername,
  login,
  logout,
  patchTodo,
  register,
  getToken,
} from "./api";
import type { Priority, Todo, TodoInput } from "./api";

const PAGE_SIZE = 10;
const PRIORITIES: Priority[] = ["low", "medium", "high"];

const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  high: "bg-rose-50 text-rose-700 ring-rose-200",
};

type Tab = "all" | "open" | "completed";

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isOverdue(todo: Todo): boolean {
  return !todo.completed && todo.due_date !== null && todo.due_date < todayISO();
}

function fieldError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? getUsername() : null,
  );

  const handleSignIn = (name: string) => setUsername(name);
  const handleSignOut = () => {
    void logout().finally(() => setUsername(null));
  };

  if (!username) {
    return <AuthScreen onSignIn={handleSignIn} />;
  }
  return (
    <TodoScreen username={username} onSignOut={handleSignOut} />
  );
}

function AuthScreen({ onSignIn }: { onSignIn: (username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
        setNotice("Account created — please sign in.");
        setMode("login");
      } else {
        await login(username.trim(), password);
        onSignIn(username.trim());
      }
    } catch (err) {
      setError(fieldError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800 text-center mb-6">
          My Todos
        </h1>
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 p-6">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-lg p-1 mb-6">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`rounded-md py-1.5 text-sm font-medium transition ${
                  mode === m
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Username
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="mt-1 w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. alice"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "register" ? 8 : undefined}
                className="mt-1 w-full rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder={
                  mode === "register" ? "at least 8 characters" : "••••••••"
                }
              />
            </label>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TodoScreen({
  username,
  onSignOut,
}: {
  username: string;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState<Priority | "">("");
  const [items, setItems] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const requestSeq = useRef(0);

  const tabToCompleted = (t: Tab): boolean | undefined =>
    t === "open" ? false : t === "completed" ? true : undefined;

  const load = useCallback(
    async (reset: boolean, nextPage?: number) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setListError(null);
      try {
        const target = reset ? 1 : (nextPage ?? page);
        const data = await fetchTodos({
          completed: tabToCompleted(tab),
          priority: priority || undefined,
          page: target,
          page_size: PAGE_SIZE,
        });
        if (seq !== requestSeq.current) return;
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setRemaining(data.remaining);
        setPage(data.page);
      } catch (err) {
        if (seq === requestSeq.current) setListError(fieldError(err));
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [tab, priority, page],
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, priority]);

  const refreshOpenCount = useCallback(async () => {
    try {
      const data = await fetchTodos({ completed: false, page: 1, page_size: 1 });
      setOpenCount(data.total);
    } catch {
      /* count is best-effort */
    }
  }, []);

  useEffect(() => {
    void refreshOpenCount();
  }, [refreshOpenCount, tab, priority, items.length]);

  const updateTodo = (updated: Todo) => {
    setItems((prev) => {
      const idx = prev.findIndex((t) => t.id === updated.id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
    void refreshOpenCount();
  };

  const removeTodo = (id: number) => {
    setItems((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length !== prev.length) setTotal((v) => v - 1);
      return next;
    });
    void refreshOpenCount();
  };

  const hasMore = items.length < total;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">My Todos</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as <strong>{username}</strong>
              {openCount !== null && (
                <span className="ml-2 inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {openCount} open
                </span>
              )}
            </span>
            <button
              onClick={onSignOut}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <AddForm onAdded={() => void load(true)} />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 bg-slate-200/70 rounded-lg p-1">
              {(["all", "open", "completed"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${
                    tab === t
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority | "")}
                className="rounded-lg border-0 bg-white px-2 py-1.5 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">All</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {listError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {listError}
            </p>
          )}

          <ul className="space-y-3">
            {items.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onChanged={updateTodo}
                onDeleted={removeTodo}
              />
            ))}
            {!loading && items.length === 0 && !listError && (
              <li className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
                No todos here yet.
              </li>
            )}
          </ul>

          {hasMore && (
            <div className="text-center">
              <button
                onClick={() => void load(false, page + 1)}
                disabled={loading}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-600 ring-1 ring-inset ring-slate-300 hover:bg-indigo-50 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
          <p className="text-center text-xs text-slate-500">
            Showing {items.length} of {total}
            {remaining > 0 && ` · ${remaining} more to load`}
          </p>
        </section>
      </main>
    </div>
  );
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const input: TodoInput = { title: title.trim(), priority };
      if (description.trim()) input.description = description.trim();
      if (dueDate) input.due_date = dueDate;
      await createTodo(input);
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueDate("");
      onAdded();
    } catch (err) {
      setError(fieldError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-3"
    >
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a new todo…"
          maxLength={200}
          required
          className="flex-1 rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-50 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="rounded-lg border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p} className="capitalize">
              {p} priority
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-lg border-0 px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </form>
  );
}

function TodoRow({
  todo,
  onChanged,
  onDeleted,
}: {
  todo: Todo;
  onChanged: (t: Todo) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setError(null);
    try {
      const updated = await patchTodo(todo.id, { completed: !todo.completed });
      onChanged(updated);
    } catch (err) {
      setError(fieldError(err));
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${todo.title}"? This cannot be undone.`))
      return;
    setError(null);
    try {
      await deleteTodo(todo.id);
      onDeleted(todo.id);
    } catch (err) {
      setError(fieldError(err));
    }
  };

  const overdue = isOverdue(todo);

  return (
    <li
      className={`rounded-xl bg-white shadow-sm ring-1 p-4 ${
        overdue
          ? "ring-2 ring-rose-400 bg-rose-50/40"
          : "ring-slate-200"
      } ${todo.completed ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={toggle}
          className="mt-1.5 h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
          aria-label={`Mark "${todo.title}" ${todo.completed ? "open" : "complete"}`}
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <EditForm todo={todo} onDone={onChanged} onClose={() => setEditing(false)} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    todo.completed
                      ? "text-slate-400 line-through"
                      : "text-slate-800"
                  }`}
                >
                  {todo.title}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${PRIORITY_BADGE[todo.priority]}`}
                >
                  {todo.priority}
                </span>
                {todo.due_date && (
                  <span
                    className={`text-xs font-medium ${
                      overdue ? "text-rose-600" : "text-slate-500"
                    }`}
                  >
                    due {todo.due_date}
                    {overdue && " (overdue)"}
                  </span>
                )}
              </div>
              {todo.description && (
                <p className="mt-1 text-sm text-slate-500 whitespace-pre-wrap">
                  {todo.description}
                </p>
              )}
            </>
          )}
          {error && !editing && (
            <p className="mt-2 text-xs text-rose-600">{error}</p>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Edit
            </button>
            <button
              onClick={remove}
              className="rounded-md px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-700"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function EditForm({
  todo,
  onDone,
  onClose,
}: {
  todo: Todo;
  onDone: (t: Todo) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description ?? "");
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [dueDate, setDueDate] = useState(todo.due_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const input: TodoInput = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
      };
      const updated = await patchTodo(todo.id, input);
      onDone(updated);
      onClose();
    } catch (err) {
      setError(fieldError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
        className="w-full rounded-lg border-0 px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description (optional)"
        className="w-full rounded-lg border-0 px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="rounded-lg border-0 bg-white px-2 py-1.5 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p} className="capitalize">
              {p}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-lg border-0 px-2 py-1.5 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-50 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </form>
  );
}
