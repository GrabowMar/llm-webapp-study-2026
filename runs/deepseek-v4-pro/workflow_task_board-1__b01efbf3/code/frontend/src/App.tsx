import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import AuthForm from "./AuthForm";
import Column from "./Column";
import ConfirmDialog from "./ConfirmDialog";
import { BoardStore, PRIORITIES, PRIORITY_LABEL, STATUSES } from "./store";
import TaskDialog from "./TaskDialog";
import type { Priority, Status, Task } from "./types";

type Dialog =
  | { kind: "create"; status: Status }
  | { kind: "edit"; task: Task }
  | { kind: "delete"; task: Task }
  | null;

export default function App() {
  const [store] = useState(() => new BoardStore());
  const [token, setToken] = useState<string | null>(store.token);
  const [username, setUsername] = useState<string | null>(store.username);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<Record<Status, number>>({
    todo: 0,
    in_progress: 0,
    done: 0,
  });
  const [priority, setPriority] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await store.loadTasks(priority);
      setTasks(list.items);
      setCounts(list.counts);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        store.signOut();
        setToken(null);
        setUsername(null);
      }
    } finally {
      setLoading(false);
    }
  }, [store, priority]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const handleLogin = async (u: string, p: string) => {
    const res = await store.login(u, p);
    setToken(res.token);
    setUsername(res.username);
    setShowAuth(false);
    await refresh();
  };

  const handleRegister = async (u: string, p: string) => {
    await store.register(u, p);
    setAuthMode("login");
    setNotice("Account created. You can now sign in.");
  };

  const handleSignOut = () => {
    store.signOut();
    setToken(null);
    setUsername(null);
    void refresh();
  };

  const handleSave = async (input: {
    title: string;
    description: string;
    status: Status;
    priority: Priority;
  }) => {
    if (dialog?.kind === "edit") {
      await store.updateTask(dialog.task.id, input);
    } else {
      await store.createTask(input);
    }
    setDialog(null);
    await refresh();
  };

  const handleDelete = async () => {
    if (dialog?.kind !== "delete") return;
    await store.deleteTask(dialog.task.id);
    setDialog(null);
    await refresh();
  };

  const handleDropTask = async (taskId: number, status: Status, position: number) => {
    if (!token) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (task.status === status) {
      if (task.position === position) return;
      setTasks((prev) => reorderWithin(prev, taskId, status, position));
      await store.updateTask(taskId, { position });
    } else {
      const moving = task.status;
      setTasks((prev) => moveAcross(prev, taskId, moving, status, position));
      setCounts((prev) => ({
        ...prev,
        [moving]: Math.max(0, prev[moving] - 1),
        [status]: prev[status] + 1,
      }));
      await store.updateTask(taskId, { status, position });
    }
  };

  const signedIn = !!token;
  const visibleTasks = priority
    ? tasks.filter((t) => t.priority === priority)
    : tasks;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">Kanban Board</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Priority</span>
              <select
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={priority ?? ""}
                onChange={(e) => setPriority(e.target.value || null)}
              >
                <option value="">All</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            {signedIn ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <strong>{username}</strong>
                </span>
                <button
                  onClick={handleSignOut}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setAuthMode("login");
                    setShowAuth(true);
                  }}
                  className="rounded-md px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Sign in
                </button>
                <button
                  onClick={() => {
                    setAuthMode("register");
                    setShowAuth(true);
                  }}
                  className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {notice && (
          <div className="mb-4 rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800">
            {notice}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={visibleTasks
                  .filter((t) => t.status === status)
                  .sort((a, b) => a.position - b.position)}
                count={counts[status]}
                canEdit={signedIn}
                onAdd={(s) => setDialog({ kind: "create", status: s })}
                onEdit={(t) => setDialog({ kind: "edit", task: t })}
                onDelete={(t) => setDialog({ kind: "delete", task: t })}
                onDropTask={handleDropTask}
              />
            ))}
          </div>
        )}
      </main>

      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <div className="flex justify-end">
              <button
                onClick={() => setShowAuth(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <AuthForm
              mode={authMode}
              onLogin={handleLogin}
              onRegister={handleRegister}
              onSwitch={() =>
                setAuthMode(authMode === "login" ? "register" : "login")
              }
            />
          </div>
        </div>
      )}

      {dialog?.kind === "create" && (
        <TaskDialog
          mode="create"
          initial={{ status: dialog.status } as Task}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "edit" && (
        <TaskDialog
          mode="edit"
          initial={dialog.task}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          task={dialog.task}
          onConfirm={handleDelete}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function reorderWithin(
  prev: Task[],
  taskId: number,
  status: Status,
  position: number,
): Task[] {
  const task = prev.find((t) => t.id === taskId)!;
  const without = prev.filter((t) => t.id !== taskId);
  const col = without
    .filter((t) => t.status === status)
    .sort((a, b) => a.position - b.position);
  const clamped = Math.max(1, Math.min(position, col.length + 1));
  const updated: Task = { ...task, position: clamped };
  const before = col.slice(0, clamped - 1);
  const after = col.slice(clamped - 1);
  return [
    ...without.filter((t) => t.status !== status),
    ...before.map((t, i) => ({ ...t, position: i + 1 })),
    updated,
    ...after.map((t, i) => ({ ...t, position: clamped + i + 1 })),
  ];
}

function moveAcross(
  prev: Task[],
  taskId: number,
  from: Status,
  to: Status,
  position: number,
): Task[] {
  const task = prev.find((t) => t.id === taskId)!;
  const without = prev.filter((t) => t.id !== taskId);
  const sourceCol = without
    .filter((t) => t.status === from)
    .sort((a, b) => a.position - b.position);
  const destCol = without
    .filter((t) => t.status === to)
    .sort((a, b) => a.position - b.position);
  const clamped = Math.max(1, Math.min(position, destCol.length + 1));
  const updated: Task = { ...task, status: to, position: clamped };
  const before = destCol.slice(0, clamped - 1);
  const after = destCol.slice(clamped - 1);
  return [
    ...without.filter((t) => t.status !== from && t.status !== to),
    ...sourceCol.map((t, i) => ({ ...t, position: i + 1 })),
    ...before.map((t, i) => ({ ...t, position: i + 1 })),
    updated,
    ...after.map((t, i) => ({ ...t, position: clamped + i + 1 })),
  ];
}
