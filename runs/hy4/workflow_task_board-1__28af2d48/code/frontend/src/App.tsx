import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  api,
  clearSession,
  errorMessages,
  getToken,
  getUsername,
  setSession,
  type Priority,
  type Status,
  type Task,
  type TaskList,
} from "./api";

const COLUMNS: { status: Status; label: string; accent: string; dot: string }[] = [
  { status: "todo", label: "To Do", accent: "bg-slate-400", dot: "bg-slate-400" },
  { status: "in_progress", label: "In Progress", accent: "bg-amber-400", dot: "bg-amber-400" },
  { status: "done", label: "Done", accent: "bg-emerald-500", dot: "bg-emerald-500" },
];

const PRIORITIES: Priority[] = ["low", "medium", "high"];

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  medium: "bg-sky-100 text-sky-700 ring-sky-200",
  high: "bg-rose-100 text-rose-700 ring-rose-200",
};

const DRAG_TYPE = "application/x-kanban-task";

interface AuthPanelProps {
  onAuthenticated: (username: string) => void;
}

function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessages([]);
    setBusy(true);
    try {
      if (mode === "register") {
        await api<{ username: string }>("/auth/register", { method: "POST" }, { username, password });
      }
      const { token } = await api<{ token: string }>("/auth/login", { method: "POST" }, { username, password });
      setSession(token, username.trim());
      onAuthenticated(username.trim());
    } catch (error) {
      setMessages(errorMessages(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            K
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kanban Board</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage tasks.</p>
        </div>
        <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
          {(["login", "register"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setMessages([]);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {value === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="auth-username" className="mb-1.5 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="auth-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="Your username"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="At least 6 characters"
            />
          </div>
          {messages.length > 0 && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-400">
          You can browse the board without an account.
        </p>
      </div>
    </div>
  );
}

interface DialogProps {
  task: Task | null;
  defaultStatus: Status;
  onClose: () => void;
  onSaved: () => void;
}

function TaskDialog({ task, defaultStatus, onClose, onSaved }: DialogProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Status>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessages([]);
    setBusy(true);
    try {
      const payload = { title, description, status, priority };
      if (task) {
        await api<Task>(`/tasks/${task.id}`, { method: "PATCH" }, payload);
      } else {
        await api<Task>("/tasks", { method: "POST" }, payload);
      }
      onSaved();
    } catch (error) {
      setMessages(errorMessages(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{task ? "Edit task" : "New task"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="task-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="What needs to be done?"
            />
          </div>
          <div>
            <label htmlFor="task-description" className="mb-1.5 block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="task-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="Optional details"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="task-status" className="mb-1.5 block text-sm font-medium text-slate-700">
                Column
              </label>
              <select
                id="task-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as Status)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {COLUMNS.map((column) => (
                  <option key={column.status} value={column.status}>
                    {column.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="task-priority" className="mb-1.5 block text-sm font-medium text-slate-700">
                Priority
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm capitalize outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {messages.length > 0 && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : task ? "Save changes" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConfirmProps {
  task: Task;
  onClose: () => void;
  onConfirmed: () => void;
}

function DeleteDialog({ task, onClose, onConfirmed }: ConfirmProps) {
  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      onConfirmed();
    } catch (error) {
      setMessages(errorMessages(error));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900">Delete task?</h2>
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{task.title}</span> will be permanently removed.
        </p>
        {messages.length > 0 && (
          <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {messages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  task: Task;
  signedIn: boolean;
  dragging: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, task: Task) => void;
  onDragEnd: () => void;
  onDragOverCard: (event: DragEvent<HTMLDivElement>, task: Task) => void;
}

function TaskCard({
  task,
  signedIn,
  dragging,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverCard,
}: CardProps) {
  return (
    <div
      draggable={signedIn}
      onDragStart={(event) => onDragStart(event, task)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOverCard(event, task)}
      className={`group rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition ${
        signedIn ? "cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:shadow-md" : ""
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-slate-800 break-words">{task.title}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${PRIORITY_STYLES[task.priority]}`}
        >
          {task.priority}
        </span>
      </div>
      {task.description && (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-500 break-words">
          {task.description}
        </p>
      )}
      {signedIn && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
          <span className="text-[11px] tabular-nums text-slate-400">#{task.position}</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-700"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() => getUsername());
  const [showAuth, setShowAuth] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<Record<Status, number>>({ todo: 0, in_progress: 0, done: 0 });
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [loading, setLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "create"; status: Status } | { kind: "edit"; task: Task } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ status: Status; position: number } | null>(null);
  const dropRef = useRef<{ status: Status; position: number } | null>(null);
  const dragIdRef = useRef<number | null>(null);

  const signedIn = !!username && !!getToken();

  const load = useCallback(async () => {
    try {
      const query = priorityFilter === "all" ? "" : `?priority=${priorityFilter}`;
      const data = await api<TaskList>(`/tasks${query}`);
      setTasks(data.items);
      setCounts(data.counts);
      setBoardError(null);
    } catch (error) {
      setBoardError(errorMessages(error).join(" "));
    } finally {
      setLoading(false);
    }
  }, [priorityFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (username && !getToken()) setUsername(null);
  }, [username]);

  const byColumn = useMemo(() => {
    const grouped: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const task of tasks) grouped[task.status].push(task);
    for (const status of Object.keys(grouped) as Status[]) {
      grouped[status].sort((a, b) => a.position - b.position);
    }
    return grouped;
  }, [tasks]);

  function setDrop(status: Status, position: number) {
    const next = { status, position };
    const current = dropRef.current;
    if (!current || current.status !== status || current.position !== position) {
      dropRef.current = next;
      setDropTarget(next);
    }
  }

  function clearDrop() {
    dropRef.current = null;
    setDropTarget(null);
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, task: Task) {
    dragIdRef.current = task.id;
    setDraggingId(task.id);
    event.dataTransfer.setData(DRAG_TYPE, String(task.id));
    event.dataTransfer.setData("text/plain", String(task.id));
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    dragIdRef.current = null;
    setDraggingId(null);
    clearDrop();
  }

  function handleDragOverCard(event: DragEvent<HTMLDivElement>, task: Task) {
    if (!signedIn || dragIdRef.current === null) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDrop(task.status, task.position + (after ? 1 : 0));
  }

  function handleDragOverColumn(event: DragEvent<HTMLElement>, status: Status) {
    if (!signedIn || dragIdRef.current === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDrop(status, byColumn[status].length + 1);
  }

  async function handleDrop(event: DragEvent<HTMLElement>, status: Status) {
    event.preventDefault();
    const id = dragIdRef.current;
    const target = dropRef.current;
    clearDrop();
    dragIdRef.current = null;
    setDraggingId(null);
    if (!signedIn || id === null || !target) return;
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const max = task.status === status ? byColumn[status].length : byColumn[status].length + 1;
    const position = Math.min(Math.max(target.position, 1), max);
    if (task.status === status && task.position === position) return;
    try {
      await api<Task>(`/tasks/${id}`, { method: "PATCH" }, { status, position });
      await load();
    } catch (error) {
      setBoardError(errorMessages(error).join(" "));
      await load();
    }
  }

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* local sign-out regardless */
    }
    clearSession();
    setUsername(null);
  }

  function dialogSaved() {
    setDialog(null);
    void load();
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              K
            </div>
            <h1 className="text-lg font-bold tracking-tight">Kanban Board</h1>
          </div>
          <div className="flex items-center gap-3">
            {signedIn ? (
              <>
                <span className="text-sm text-slate-500">
                  Signed in as <span className="font-semibold text-slate-800">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuth(true)}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Board</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {signedIn ? "Drag cards to move or reorder tasks." : "Sign in to create and organise tasks."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="priority-filter" className="text-sm font-medium text-slate-600">
                Priority
              </label>
              <select
                id="priority-filter"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as Priority | "all")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm capitalize outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="all">All</option>
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            {signedIn && (
              <button
                type="button"
                onClick={() => setDialog({ kind: "create", status: "todo" })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10 3a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5v-5.5A.75.75 0 0 1 10 3Z" />
                </svg>
                New task
              </button>
            )}
          </div>
        </div>

        {boardError && (
          <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {boardError}
          </div>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-slate-400">Loading board…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {COLUMNS.map((column) => {
              const cards = byColumn[column.status];
              const filtered = priorityFilter !== "all";
              return (
                <section
                  key={column.status}
                  onDragOver={(event) => handleDragOverColumn(event, column.status)}
                  onDrop={(event) => void handleDrop(event, column.status)}
                  className="flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
                >
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />
                      <h3 className="text-sm font-bold text-slate-700">{column.label}</h3>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                        {filtered ? cards.length : counts[column.status]}
                      </span>
                    </div>
                    {signedIn && (
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "create", status: column.status })}
                        aria-label={`Add task to ${column.label}`}
                        className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-indigo-600"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M10 3a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5v-5.5A.75.75 0 0 1 10 3Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                    <div className="flex flex-1 flex-col gap-2">
                    {cards.map((task, index) => (
                      <div key={task.id}>
                        {dropTarget?.status === column.status && dropTarget.position === index + 1 && (
                          <div className="mb-2 h-1 rounded-full bg-indigo-500" />
                        )}
                        <TaskCard
                          task={task}
                          signedIn={signedIn}
                          dragging={draggingId === task.id}
                          onEdit={(t) => setDialog({ kind: "edit", task: t })}
                          onDelete={setDeleting}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDragOverCard={handleDragOverCard}
                        />
                      </div>
                    ))}
                    {dropTarget?.status === column.status && dropTarget.position === cards.length + 1 && (
                      <div className="h-1 rounded-full bg-indigo-500" />
                    )}
                    {cards.length === 0 && (
                      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
                        {filtered ? "No matching tasks" : "No tasks yet"}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {showAuth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAuth(false);
          }}
        >
          <div className="w-full max-w-md px-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAuth(false)}
                aria-label="Close"
                className="absolute -top-2 right-0 z-10 rounded-lg p-1.5 text-slate-500 hover:bg-white/70 hover:text-slate-800"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
              <AuthPanel
                onAuthenticated={(name) => {
                  setUsername(name);
                  setShowAuth(false);
                  void load();
                }}
              />
            </div>
          </div>
        </div>
      )}
      {dialog && (
        <TaskDialog
          task={dialog.kind === "edit" ? dialog.task : null}
          defaultStatus={dialog.kind === "create" ? dialog.status : "todo"}
          onClose={() => setDialog(null)}
          onSaved={dialogSaved}
        />
      )}
      {deleting && (
        <DeleteDialog
          task={deleting}
          onClose={() => setDeleting(null)}
          onConfirmed={() => {
            setDeleting(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
