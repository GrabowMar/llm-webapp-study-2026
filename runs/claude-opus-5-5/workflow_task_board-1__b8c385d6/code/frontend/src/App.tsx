import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import AuthForms from "./AuthForms";
import { ConfirmDeleteDialog, TaskDialog } from "./Dialogs";
import {
  api,
  ApiError,
  getStoredUsername,
  getToken,
  PRIORITIES,
  setToken,
  STATUSES,
  type Priority,
  type Status,
  type Task,
  type TaskInput,
} from "./api";

type DropTarget = { status: Status; beforeId: number | null };

const PRIORITY_BADGE: Record<Priority, string> = {
  low: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  medium: "bg-amber-100 text-amber-800 ring-amber-200",
  high: "bg-red-100 text-red-800 ring-red-200",
};

const COLUMN_ACCENT: Record<Status, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-indigo-500",
  done: "bg-emerald-500",
};

function sortTasks(tasks: Task[]): Task[] {
  const order: Record<Status, number> = { todo: 0, in_progress: 1, done: 2 };
  return [...tasks].sort((a, b) => order[a.status] - order[b.status] || a.position - b.position || a.id - b.id);
}

function applyMove(tasks: Task[], id: number, status: Status, position: number): Task[] {
  const moving = tasks.find((t) => t.id === id);
  if (!moving) return tasks;
  const columns: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const t of sortTasks(tasks)) if (t.id !== id) columns[t.status].push(t);
  const target = columns[status];
  const idx = Math.max(0, Math.min(position - 1, target.length));
  target.splice(idx, 0, { ...moving, status });
  return STATUSES.flatMap(({ key }) => columns[key].map((t, i) => ({ ...t, position: i + 1 })));
}

export default function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => (getToken() ? getStoredUsername() : null));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [creating, setCreating] = useState<Status | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggingRef = useRef(false);

  const signedIn = Boolean(token && username);

  const signOutLocal = useCallback(() => {
    setToken(null, null);
    setTokenState(null);
    setUsername(null);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        signOutLocal();
        setNotice("Your session has expired. Please sign in again.");
      } else {
        setNotice(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    },
    [signOutLocal],
  );

  const load = useCallback(async () => {
    try {
      const res = await api.listTasks();
      if (!draggingRef.current) setTasks(res.items);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .me()
      .then((u) => {
        if (!cancelled) {
          setUsername(u.username);
          setToken(token, u.username);
        }
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.status === 401) signOutLocal();
      });
    return () => {
      cancelled = true;
    };
  }, [token, signOutLocal]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const onAuthenticated = (newToken: string, name: string) => {
    setToken(newToken, name);
    setTokenState(newToken);
    setUsername(name);
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    signOutLocal();
  };

  const columns = useMemo(() => {
    const result: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of sortTasks(tasks)) result[t.status].push(t);
    return result;
  }, [tasks]);

  const visible = useMemo(() => {
    const result: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const s of STATUSES) {
      result[s.key] = priorityFilter ? columns[s.key].filter((t) => t.priority === priorityFilter) : columns[s.key];
    }
    return result;
  }, [columns, priorityFilter]);

  const createTask = async (input: TaskInput) => {
    try {
      await api.createTask(input);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleError(err);
      throw err;
    }
    setCreating(null);
    await load();
  };

  const updateTask = async (id: number, input: TaskInput) => {
    try {
      await api.updateTask(id, input);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        handleError(err);
        setEditing(null);
        await load();
      }
      throw err;
    }
    setEditing(null);
    await load();
  };

  const deleteTask = async (id: number) => {
    try {
      await api.deleteTask(id);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        handleError(err);
        setDeleting(null);
        await load();
        return;
      }
      throw err;
    }
    setDeleting(null);
    await load();
  };

  const computeTargetPosition = (task: Task, target: DropTarget): number => {
    let slot: number;
    if (target.beforeId !== null) {
      const before = tasks.find((t) => t.id === target.beforeId);
      slot = before ? before.position : columns[target.status].length + 1;
    } else {
      slot = columns[target.status].length + 1;
    }
    if (task.status === target.status && slot > task.position) slot -= 1;
    return Math.max(1, slot);
  };

  const endDrag = () => {
    draggingRef.current = false;
    setDraggingId(null);
    setDropTarget(null);
  };

  const onDrop = async (e: DragEvent, target: DropTarget) => {
    e.preventDefault();
    const id = draggingId ?? Number(e.dataTransfer.getData("text/plain"));
    endDrag();
    const task = tasks.find((t) => t.id === id);
    if (!task || !signedIn) return;
    const position = computeTargetPosition(task, target);
    if (task.status === target.status && task.position === position) return;
    const previous = tasks;
    setTasks(applyMove(tasks, id, target.status, position));
    try {
      const body: TaskInput = { position };
      if (target.status !== task.status) body.status = target.status;
      await api.updateTask(id, body);
    } catch (err) {
      setTasks(previous);
      handleError(err);
    }
    await load();
  };

  const onCardDragOver = (e: DragEvent<HTMLElement>, status: Status, index: number) => {
    if (draggingId === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const list = visible[status];
    const beforeTask = after ? list[index + 1] : list[index];
    const beforeId = beforeTask ? beforeTask.id : null;
    if (!dropTarget || dropTarget.status !== status || dropTarget.beforeId !== beforeId) {
      setDropTarget({ status, beforeId });
    }
  };

  const onColumnDragOver = (e: DragEvent<HTMLElement>, status: Status) => {
    if (draggingId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dropTarget || dropTarget.status !== status) {
      setDropTarget({ status, beforeId: null });
    }
  };

  const indicator = <div className="h-1 rounded-full bg-indigo-500" aria-hidden="true" />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight">Kanban board</h1>
          {signedIn ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold text-slate-900" data-testid="current-user">{username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-500">Viewing as guest — sign in to edit tasks.</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {!signedIn && (
          <div className="mb-6 flex justify-center">
            <AuthForms onAuthenticated={onAuthenticated} />
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="priority-filter" className="text-sm font-medium text-slate-700">
              Priority
            </label>
            <select
              id="priority-filter"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as Priority | "")}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {signedIn && (
            <button
              type="button"
              onClick={() => setCreating("todo")}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              + New task
            </button>
          )}
        </div>

        {notice && (
          <div role="status" className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            {notice}
          </div>
        )}
        {loadError && (
          <div role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {loadError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {STATUSES.map(({ key, label }) => {
            const list = visible[key];
            const total = columns[key].length;
            const isTarget = dropTarget?.status === key;
            return (
              <section
                key={key}
                aria-label={label}
                data-status={key}
                onDragOver={(e) => onColumnDragOver(e, key)}
                onDrop={(e) => onDrop(e, dropTarget?.status === key ? dropTarget : { status: key, beforeId: null })}
                className={`flex min-h-64 flex-col rounded-xl bg-slate-200/60 p-3 transition ${
                  isTarget ? "ring-2 ring-indigo-300" : ""
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                    <span className={`h-2 w-2 rounded-full ${COLUMN_ACCENT[key]}`} />
                    {label}
                  </h2>
                  <span
                    className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                    data-testid={`count-${key}`}
                  >
                    {priorityFilter ? `${list.length} / ${total}` : total}
                  </span>
                </div>

                <ul className="flex flex-1 flex-col gap-2">
                  {loading && list.length === 0 && <li className="text-sm text-slate-500">Loading…</li>}
                  {!loading && list.length === 0 && !isTarget && (
                    <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                      No tasks
                    </li>
                  )}
                  {list.map((task, index) => (
                    <li key={task.id} className="flex flex-col gap-2">
                      {isTarget && dropTarget?.beforeId === task.id && draggingId !== task.id && indicator}
                      <article
                        draggable={signedIn}
                        onDragStart={(e) => {
                          draggingRef.current = true;
                          setDraggingId(task.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(task.id));
                        }}
                        onDragEnd={endDrag}
                        onDragOver={(e) => onCardDragOver(e, key, index)}
                        data-task-id={task.id}
                        className={`group rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition ${
                          signedIn ? "cursor-grab active:cursor-grabbing hover:border-indigo-300" : ""
                        } ${draggingId === task.id ? "opacity-40" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-medium break-words text-slate-900">{task.title}</h3>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ${
                              PRIORITY_BADGE[task.priority]
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>
                        {task.description && (
                          <p className="mt-1 line-clamp-3 text-xs whitespace-pre-line text-slate-600">
                            {task.description}
                          </p>
                        )}
                        {signedIn && (
                          <div className="mt-2 flex justify-end gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={() => setEditing(task)}
                              className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              aria-label={`Edit ${task.title}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(task)}
                              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              aria-label={`Delete ${task.title}`}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </article>
                    </li>
                  ))}
                  {isTarget && dropTarget?.beforeId === null && <li>{indicator}</li>}
                </ul>

                {signedIn && (
                  <button
                    type="button"
                    onClick={() => setCreating(key)}
                    className="mt-3 rounded-md px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-300/50 hover:text-slate-900"
                  >
                    + Add task
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {signedIn && creating && (
        <TaskDialog mode="create" defaultStatus={creating} onSubmit={createTask} onClose={() => setCreating(null)} />
      )}
      {signedIn && editing && (
        <TaskDialog
          mode="edit"
          task={editing}
          onSubmit={(input) => updateTask(editing.id, input)}
          onClose={() => setEditing(null)}
        />
      )}
      {signedIn && deleting && (
        <ConfirmDeleteDialog task={deleting} onConfirm={() => deleteTask(deleting.id)} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
