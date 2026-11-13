import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ApiError,
  createTask,
  deleteTask,
  fetchTasks,
  login,
  register,
  updateTask,
  type Session,
  type Status,
  type Task,
  type TaskInput,
} from "./api";

const STATUSES: Status[] = ["todo", "in_progress", "done"];

const STATUS_META: Record<
  Status,
  { label: string; accent: string; dot: string; button: string }
> = {
  todo: {
    label: "To Do",
    accent: "border-t-slate-400",
    dot: "bg-slate-400",
    button: "text-slate-700 hover:bg-slate-200",
  },
  in_progress: {
    label: "In Progress",
    accent: "border-t-amber-400",
    dot: "bg-amber-400",
    button: "text-amber-700 hover:bg-amber-100",
  },
  done: {
    label: "Done",
    accent: "border-t-emerald-400",
    dot: "bg-emerald-400",
    button: "text-emerald-700 hover:bg-emerald-100",
  },
};

const PRIORITIES = ["high", "medium", "low"];

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 ring-red-200",
  medium: "bg-amber-100 text-amber-700 ring-amber-200",
  low: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

const SESSION_KEY = "kanban.session";

function loadStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token === "string" && typeof parsed.username === "string") {
      return { token: parsed.token, username: parsed.username };
    }
    return null;
  } catch {
    return null;
  }
}

function priorityStyle(priority: string): string {
  return (
    PRIORITY_STYLES[priority.toLowerCase()] ??
    "bg-indigo-100 text-indigo-700 ring-indigo-200"
  );
}

function byPosition(a: Task, b: Task): number {
  return a.position - b.position || a.id - b.id;
}

function Column({
  status,
  tasks,
  count,
  total,
  canEdit,
  busy,
  dragOverKey,
  onAdd,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverKey,
  onDropColumn,
  onDropCard,
  draggedId,
}: {
  status: Status;
  tasks: Task[];
  count: number;
  total: number;
  canEdit: boolean;
  busy: boolean;
  dragOverKey: string | null;
  onAdd: (status: Status) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  onDragOverKey: (key: string | null) => void;
  onDropColumn: (status: Status) => void;
  onDropCard: (task: Task) => void;
  draggedId: number | null;
}) {
  const meta = STATUS_META[status];
  const endKey = `end-${status}`;

  return (
    <section
      className={`flex min-h-[28rem] flex-col rounded-xl border border-slate-200 border-t-4 bg-slate-100/70 shadow-sm ${meta.accent}`}
      onDragOver={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (dragOverKey !== endKey) onDragOverKey(endKey);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        if (dragOverKey === endKey) onDragOverKey(null);
      }}
      onDrop={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        onDropColumn(status);
        onDragOverKey(null);
      }}
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
          <h2 className="text-sm font-semibold tracking-wide text-slate-700 uppercase">
            {meta.label}
          </h2>
          <span
            className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200"
            title={
              total === count
                ? `${count} tasks`
                : `${count} of ${total} tasks match the filter`
            }
          >
            {count}
            {total !== count ? `/${total}` : ""}
          </span>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => onAdd(status)}
            className={`rounded-md px-2 py-1 text-sm font-semibold transition ${meta.button}`}
            aria-label={`Add task to ${meta.label}`}
          >
            + Add
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {tasks.map((task) => {
          const beforeKey = `before-${task.id}`;
          return (
            <article
              key={task.id}
              draggable={canEdit && !busy}
              onDragStart={(event) => {
                if (!canEdit) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(task.id));
                onDragStart(task);
              }}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                if (!canEdit) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                if (dragOverKey !== beforeKey) onDragOverKey(beforeKey);
              }}
              onDragLeave={(event) => {
                if (
                  event.currentTarget.contains(event.relatedTarget as Node | null)
                ) {
                  return;
                }
                if (dragOverKey === beforeKey) onDragOverKey(null);
              }}
              onDrop={(event) => {
                if (!canEdit) return;
                event.preventDefault();
                event.stopPropagation();
                onDropCard(task);
                onDragOverKey(null);
              }}
              className={`group rounded-lg border bg-white p-3 shadow-sm transition ${
                task.id === draggedId ? "opacity-50" : ""
              } ${
                dragOverKey === beforeKey
                  ? "border-indigo-400 ring-2 ring-indigo-200"
                  : "border-slate-200"
              } ${canEdit && !busy ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold break-words text-slate-800">
                  {task.title}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ${priorityStyle(
                    task.priority,
                  )}`}
                >
                  {task.priority}
                </span>
              </div>
              {task.description && (
                <p className="mt-1 line-clamp-4 text-xs whitespace-pre-wrap text-slate-500">
                  {task.description}
                </p>
              )}
              {canEdit && (
                <div className="mt-2 flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(task)}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              )}
            </article>
          );
        })}

        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
            {count === 0 && total > 0
              ? "No tasks match the priority filter"
              : canEdit
                ? "Drop a task here or add one"
                : "No tasks yet"}
          </div>
        )}

        {canEdit && tasks.length > 0 && (
          <div
            className={`rounded-md border border-dashed p-2 text-center text-[11px] text-slate-400 ${
              dragOverKey === endKey
                ? "border-indigo-400 bg-indigo-50 text-indigo-500"
                : "border-transparent"
            }`}
          >
            Drop here to move to the end
          </div>
        )}
      </div>
    </section>
  );
}

function Modal({
  title,
  onClose,
  children,
  width = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} rounded-xl bg-white shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {message}
    </p>
  );
}

function AuthDialog({
  onClose,
  onAuthenticated,
}: {
  onClose: () => void;
  onAuthenticated: (session: Session) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await register(username, password);
      }
      const result = await login(username, password);
      const session = { token: result.token, username: username.trim() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      onAuthenticated(session);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={mode === "login" ? "Sign in" : "Create an account"}
      onClose={onClose}
      width="max-w-sm"
    >
      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {(["login", "register"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMode(option);
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 transition ${
                mode === option
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {option === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            value={password}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <FormError message={error} />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </Modal>
  );
}

function TaskDialog({
  task,
  defaultStatus,
  onClose,
  onSave,
}: {
  task: Task | null;
  defaultStatus: Status;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Status>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSave({ title, description, status, priority });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={task ? "Edit task" : "New task"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        <label className="block text-sm font-medium text-slate-700">
          Title
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description
          <textarea
            rows={4}
            className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Column
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_META[value].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Priority
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <FormError message={error} />

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : task ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({
  task,
  onClose,
  onConfirm,
}: {
  task: Task;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Delete task" onClose={onClose} width="max-w-sm">
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold text-slate-800">{task.title}</span>?
          This cannot be undone.
        </p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(loadStoredSession);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [authOpen, setAuthOpen] = useState(false);
  const [editor, setEditor] = useState<{
    task: Task | null;
    status: Status;
  } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchTasks();
      setTasks(result.items);
      setLoadError(null);
    } catch (caught) {
      setLoadError(
        caught instanceof ApiError
          ? caught.message
          : "Could not load tasks.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  const sorted = useMemo(() => [...tasks].sort(byPosition), [tasks]);

  const visible = useMemo(
    () =>
      priorityFilter === "all"
        ? sorted
        : sorted.filter(
            (task) => task.priority.toLowerCase() === priorityFilter,
          ),
    [sorted, priorityFilter],
  );

  const grouped = useMemo(() => {
    const result: Record<Status, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const task of visible) {
      if (result[task.status]) result[task.status].push(task);
    }
    return result;
  }, [visible]);

  const totals = useMemo(() => {
    const result: Record<Status, number> = {
      todo: 0,
      in_progress: 0,
      done: 0,
    };
    for (const task of sorted) {
      if (result[task.status] !== undefined) result[task.status] += 1;
    }
    return result;
  }, [sorted]);

  const saveNew = async (input: TaskInput) => {
    if (!session) throw new ApiError("Please sign in first.", 401);
    await createTask(input, session.token);
    await refresh();
  };

  const saveEdit = async (task: Task, input: TaskInput) => {
    if (!session) throw new ApiError("Please sign in first.", 401);
    await updateTask(task.id, input, session.token);
    await refresh();
  };

  const confirmDelete = async (task: Task) => {
    if (!session) throw new ApiError("Please sign in first.", 401);
    await deleteTask(task.id, session.token);
    await refresh();
  };

  const move = async (targetStatus: Status, position: number) => {
    if (!session || draggedId === null) return;
    const task = tasks.find((item) => item.id === draggedId);
    if (!task) return;
    if (task.status === targetStatus && task.position === position) return;

    setBusy(true);
    setActionError(null);
    try {
      await updateTask(
        task.id,
        { status: targetStatus, position },
        session.token,
      );
      await refresh();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError
          ? caught.message
          : "Could not move the task.",
      );
    } finally {
      setBusy(false);
      setDraggedId(null);
      setDragOverKey(null);
    }
  };

  const dropAtEnd = (status: Status) => {
    if (draggedId === null) return;
    const column = sorted.filter(
      (task) => task.status === status && task.id !== draggedId,
    );
    void move(status, column.length + 1);
  };

  const dropBefore = (target: Task) => {
    if (draggedId === null || draggedId === target.id) return;
    const column = sorted.filter(
      (task) => task.status === target.status && task.id !== draggedId,
    );
    const index = column.findIndex((task) => task.id === target.id);
    const position = index < 0 ? column.length + 1 : index + 1;
    void move(target.status, position);
  };

  const canEdit = session !== null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              K
            </span>
            <div>
              <h1 className="text-lg leading-tight font-bold">Kanban Board</h1>
              <p className="text-xs text-slate-400">
                {session
                  ? `Signed in as ${session.username}`
                  : "Viewing as a guest"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
              Priority
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="all">All priorities</option>
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            {session ? (
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {actionError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="font-semibold"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded bg-white px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">
            Loading tasks…
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={grouped[status]}
                count={grouped[status].length}
                total={totals[status]}
                canEdit={canEdit}
                busy={busy}
                dragOverKey={dragOverKey}
                draggedId={draggedId}
                onAdd={(value) => setEditor({ task: null, status: value })}
                onEdit={(task) => setEditor({ task, status: task.status })}
                onDelete={(task) => setDeleting(task)}
                onDragStart={(task) => {
                  setDraggedId(task.id);
                  setActionError(null);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverKey(null);
                }}
                onDragOverKey={setDragOverKey}
                onDropColumn={dropAtEnd}
                onDropCard={dropBefore}
              />
            ))}
          </div>
        )}

        {!session && !loading && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Sign in to create, edit, move and delete tasks.
          </p>
        )}
      </main>

      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          onAuthenticated={(value) => {
            setSession(value);
            setActionError(null);
          }}
        />
      )}

      {editor && (
        <TaskDialog
          key={editor.task?.id ?? `new-${editor.status}`}
          task={editor.task}
          defaultStatus={editor.status}
          onClose={() => setEditor(null)}
          onSave={(input) =>
            editor.task ? saveEdit(editor.task, input) : saveNew(input)
          }
        />
      )}

      {deleting && (
        <DeleteDialog
          task={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => confirmDelete(deleting)}
        />
      )}
    </div>
  );
}
