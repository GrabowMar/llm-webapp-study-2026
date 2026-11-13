import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, onUnauthorized, Priority, session, Status, Task } from "./api";
import AuthForms from "./AuthForms";
import Column from "./Column";
import TaskDialog from "./TaskDialog";

export const COLUMNS: { status: Status; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

export default function App() {
  const [username, setUsername] = useState<string | null>(session.username && session.token ? session.username : null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Priority | "">("");
  const [showAuth, setShowAuth] = useState<"login" | "register" | null>(null);
  const [dialog, setDialog] = useState<{ task?: Task; status: Status } | null>(null);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);

  const signedIn = username !== null;

  const signOutLocal = useCallback(() => {
    session.clear();
    setUsername(null);
  }, []);

  useEffect(() => {
    onUnauthorized.handler = signOutLocal;
  }, [signOutLocal]);

  const reload = useCallback(async () => {
    try {
      const data = await api.list();
      setTasks(data.items);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const byStatus = useMemo(() => {
    const map: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) map[t.status].push(t);
    for (const s of Object.keys(map) as Status[]) map[s].sort((a, b) => a.position - b.position);
    return map;
  }, [tasks]);

  const visible = (list: Task[]) => (filter ? list.filter((t) => t.priority === filter) : list);

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    signOutLocal();
  }

  async function moveTask(taskId: number, status: Status, beforeId: number | null) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const target = byStatus[status].filter((t) => t.id !== taskId);
    let index = target.length;
    if (beforeId !== null) {
      const i = target.findIndex((t) => t.id === beforeId);
      if (i >= 0) index = i;
    }
    const position = index + 1;
    if (task.status === status && task.position === position) return;
    const prev = tasks;
    const moved = { ...task, status, position };
    target.splice(index, 0, moved);
    const old = task.status === status ? [] : byStatus[task.status].filter((t) => t.id !== taskId);
    const renum = (list: Task[]) => list.map((t, i) => ({ ...t, position: i + 1 }));
    const others = tasks.filter((t) => t.status !== status && t.status !== task.status);
    setTasks([...others, ...renum(old), ...renum(target)]);
    try {
      await api.update(taskId, { status, position });
      await reload();
    } catch (e) {
      setTasks(prev);
      setError(e instanceof ApiError ? e.message : "Failed to move task");
      await reload();
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await api.remove(toDelete.id);
      setToDelete(null);
      setDeleteError("");
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setToDelete(null);
        await reload();
        return;
      }
      setDeleteError(e instanceof ApiError ? e.message : "Failed to delete task");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 px-6 py-3 text-white">
        <h1 className="text-xl font-semibold">Kanban Board</h1>
        <div className="flex items-center gap-3">
          {signedIn ? (
            <>
              <span data-testid="current-user" className="text-sm">
                Signed in as <strong>{username}</strong>
              </span>
              <button onClick={signOut} className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500">
                Sign out
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setShowAuth("login")} className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500">
                Sign in
              </button>
              <button onClick={() => setShowAuth("register")} className="rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-500">
                Register
              </button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Priority
            <select
              aria-label="Filter by priority"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Priority | "")}
              className="rounded border border-slate-300 bg-white px-2 py-1"
            >
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          {!signedIn && <span className="text-sm text-slate-500">Sign in to create and edit tasks.</span>}
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {COLUMNS.map((c) => (
              <Column
                key={c.status}
                status={c.status}
                label={c.label}
                tasks={visible(byStatus[c.status])}
                count={byStatus[c.status].length}
                signedIn={signedIn}
                dragId={dragId}
                setDragId={setDragId}
                onDrop={moveTask}
                onAdd={() => setDialog({ status: c.status })}
                onEdit={(t) => setDialog({ task: t, status: t.status })}
                onDelete={(t) => {
                  setDeleteError("");
                  setToDelete(t);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {showAuth && (
        <AuthForms
          mode={showAuth}
          onModeChange={setShowAuth}
          onClose={() => setShowAuth(null)}
          onSignedIn={(name) => {
            setUsername(name);
            setShowAuth(null);
          }}
        />
      )}

      {dialog && (
        <TaskDialog
          task={dialog.task}
          initialStatus={dialog.status}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await reload();
          }}
        />
      )}

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Confirm delete">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold">Delete task?</h2>
            <p className="mb-4 text-sm">
              “{toDelete.title}” will be permanently deleted.
            </p>
            {deleteError && <p role="alert" className="mb-3 text-sm text-red-600">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setToDelete(null)} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={confirmDelete} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
