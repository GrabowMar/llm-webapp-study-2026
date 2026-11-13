import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  apiCreateTodo,
  apiDeleteTodo,
  apiListTodos,
  apiLogin,
  apiRegister,
  apiUpdateTodo,
  clearSession,
  getToken,
  getUsername,
  setSession,
  type Priority,
  type Todo,
  type TodoInput,
} from "./api";

type AuthView = "login" | "register";

const PRIORITIES: Priority[] = ["low", "medium", "high"];

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-red-100 text-red-700",
};

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function isOverdue(todo: Todo): boolean {
  if (!todo.due_date || todo.completed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(todo.due_date + "T00:00:00");
  return due < today;
}

function AuthForm({
  onAuthed,
}: {
  onAuthed: (username: string) => void;
}) {
  const [mode, setMode] = useState<AuthView>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await apiRegister(username, password);
        const { token } = await apiLogin(username, password);
        setSession(token, username);
      } else {
        const { token } = await apiLogin(username, password);
        setSession(token, username);
      }
      onAuthed(username);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Todo list</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex gap-1 rounded-md bg-slate-100 p-1">
          {(["login", "register"] as AuthView[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
                mode === m ? "bg-white shadow" : "text-slate-500"
              }`}
            >
              {m === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiCreateTodo({
        title,
        description: description || undefined,
        priority,
        due_date: dueDate || null,
      });
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueDate("");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]} priority
              </option>
            ))}
          </select>
        </div>
        <div>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Add todo
      </button>
    </form>
  );
}

function TodoRow({
  todo,
  onChanged,
}: {
  todo: Todo;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);

  async function toggle() {
    try {
      await apiUpdateTodo(todo.id, { completed: !todo.completed });
      onChanged();
    } catch {
      // ignore; list will be refreshed on next load
    }
  }

  async function remove() {
    if (!window.confirm("Delete this todo permanently?")) return;
    try {
      await apiDeleteTodo(todo.id);
      onChanged();
    } catch {
      // ignore
    }
  }

  if (editing) {
    return (
      <EditForm
        todo={todo}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  const overdue = isOverdue(todo);

  return (
    <li className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={toggle}
        className="mt-1 h-4 w-4"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`break-words text-sm font-medium ${
              todo.completed ? "text-slate-400 line-through" : "text-slate-800"
            }`}
          >
            {todo.title}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE[todo.priority]}`}
          >
            {PRIORITY_LABEL[todo.priority]}
          </span>
        </div>
        {todo.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">
            {todo.description}
          </p>
        )}
        {(todo.due_date || todo.completed_at) && (
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
            {todo.due_date && (
              <span className={overdue ? "font-medium text-red-600" : ""}>
                Due {formatDate(todo.due_date)}
                {overdue ? " (overdue)" : ""}
              </span>
            )}
            {todo.completed_at && (
              <span>Completed {formatDate(todo.completed_at.slice(0, 10))}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => setEditing(true)}
          className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          Edit
        </button>
        <button
          onClick={remove}
          className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function EditForm({
  todo,
  onCancel,
  onSaved,
}: {
  todo: Todo;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description);
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [dueDate, setDueDate] = useState(todo.due_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const input: TodoInput = {
        title,
        description,
        priority,
        due_date: dueDate || null,
      };
      await apiUpdateTodo(todo.id, input);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-blue-300 bg-blue-50 p-4">
      <form onSubmit={submit} className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-3">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

type FilterTab = "all" | "open" | "completed";

function TodoApp({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<FilterTab>("all");
  const [priority, setPriority] = useState<Priority | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const completedFilter =
    tab === "all" ? undefined : tab === "completed" ? true : false;

  const load = useCallback(
    async (reset: boolean) => {
      const nextPage = reset ? 1 : page + 1;
      setLoading(true);
      setError(null);
      try {
        const res = await apiListTodos({
          completed: completedFilter,
          priority,
          page: nextPage,
          pageSize: 10,
        });
        if (reset) {
          setTodos(res.items);
        } else {
          setTodos((prev) => [...prev, ...res.items]);
        }
        setPage(res.page);
        setTotal(res.total);
        setRemaining(res.remaining);

        const open = await apiListTodos({ completed: false, page: 1, pageSize: 1 });
        setOpenCount(open.total);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [page, completedFilter, priority],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, priority]);

  function signOut() {
    clearSession();
    onSignOut();
  }

  const hasMore = remaining > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Todo list</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{username}</span>
          <button
            onClick={signOut}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mb-4 flex items-center gap-2">
        <span className="rounded bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700">
          {openCount} open
        </span>
        <div className="flex gap-1 rounded-md bg-slate-100 p-1">
          {(
            [
              ["all", "All"],
              ["open", "Open"],
              ["completed", "Completed"],
            ] as [FilterTab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                tab === value ? "bg-white shadow" : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
          className="ml-auto rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      <AddForm onAdded={() => load(true)} />

      <ul className="mt-4 space-y-3">
        {todos.map((todo) => (
          <TodoRow key={todo.id} todo={todo} onChanged={() => load(true)} />
        ))}
      </ul>

      {loading && <p className="mt-4 text-center text-sm text-slate-400">Loading…</p>}
      {!loading && todos.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-400">No todos here.</p>
      )}
      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => load(false)}
            disabled={loading}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Load more
          </button>
        </div>
      )}
      <p className="mt-4 text-center text-xs text-slate-400">
        {total} {total === 1 ? "todo" : "todos"} total
      </p>
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) {
      setUsername(getUsername() ?? "(restored)");
    }
  }, []);

  if (!username) {
    return <AuthForm onAuthed={setUsername} />;
  }

  return <TodoApp username={username} onSignOut={() => setUsername(null)} />;
}
