import { useCallback, useEffect, useState } from "react";
import { ApiError, api, clearSession, getStoredUsername, getToken, storeSession } from "./api";
import { AuthDialog } from "./components/AuthDialog";
import { Board } from "./components/Board";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { TaskDialog } from "./components/TaskDialog";
import {
  EMPTY_COUNTS,
  type Priority,
  type Status,
  type Task,
  type TaskValues,
} from "./types";

interface TaskDialogState {
  mode: "create" | "edit";
  task: Task | null;
  defaultStatus: Status;
}

export default function App() {
  const [username, setUsername] = useState<string | null>(getStoredUsername());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<Record<Status, number>>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canEdit = username !== null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.listTasks(priorityFilter || null);
      setTasks(data.items);
      setCounts(data.counts ?? EMPTY_COUNTS);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, [priorityFilter]);

  useEffect(() => {
    if (getToken()) {
      api
        .me()
        .then((user) => setUsername(user.username))
        .catch(() => {
          clearSession();
          setUsername(null);
        });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function signOut() {
    clearSession();
    setUsername(null);
    setAuthMode(null);
    setTaskDialog(null);
    setDeleteTarget(null);
    setActionError(null);
  }

  function handleSessionLost(err: unknown): boolean {
    if (err instanceof ApiError && err.status === 401) {
      clearSession();
      setUsername(null);
      setTaskDialog(null);
      setDeleteTarget(null);
      setActionError("Your session has expired. Please sign in again.");
      return true;
    }
    return false;
  }

  async function handleAuth(usernameInput: string, password: string) {
    if (authMode === "login") {
      const { token } = await api.login(usernameInput, password);
      storeSession(token, usernameInput);
      setUsername(usernameInput);
    } else {
      const created = await api.register(usernameInput, password);
      storeSession(created.token, created.username);
      setUsername(created.username);
    }
    setAuthMode(null);
    setActionError(null);
    load();
  }

  async function handleTaskSubmit(values: TaskValues) {
    try {
      if (taskDialog?.mode === "edit" && taskDialog.task) {
        await api.updateTask(taskDialog.task.id, values);
      } else {
        await api.createTask(values);
      }
    } catch (err) {
      handleSessionLost(err);
      throw err;
    }
    setTaskDialog(null);
    await load();
  }

  async function handleMove(task: Task, status: Status, position: number) {
    setActionError(null);
    try {
      await api.moveTask(task.id, status, position);
      await load();
    } catch (err) {
      if (!handleSessionLost(err)) {
        setActionError(err instanceof ApiError ? err.message : "Could not move the task.");
      }
    }
  }

  function requestDelete(task: Task) {
    setTaskDialog(null);
    setDeleteError(null);
    setDeleteTarget(task);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteTask(deleteTarget.id);
    } catch (err) {
      if (!handleSessionLost(err)) {
        setDeleteError(err instanceof ApiError ? err.message : "Could not delete the task.");
      }
      setDeleteBusy(false);
      return;
    }
    setDeleteBusy(false);
    setDeleteTarget(null);
    await load();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-900">Kanban Board</h1>
            <div className="flex items-center gap-2">
              <label htmlFor="priority-filter" className="text-sm font-medium text-slate-600">
                Priority
              </label>
              <select
                id="priority-filter"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as Priority | "")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          {username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold text-slate-900">{username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Register
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {!canEdit && (
          <p className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Anyone can view the board. Sign in to create, edit, move and delete tasks.
          </p>
        )}
        {actionError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </p>
        )}
        {loadError ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </p>
        ) : (
          <Board
            tasks={tasks}
            counts={counts}
            canEdit={canEdit}
            loading={loading}
            onMove={handleMove}
            onEdit={(task) => setTaskDialog({ mode: "edit", task, defaultStatus: task.status })}
            onDelete={requestDelete}
            onCreate={(status) => setTaskDialog({ mode: "create", task: null, defaultStatus: status })}
          />
        )}
        {loading && tasks.length === 0 && !loadError && (
          <p className="mt-4 text-center text-sm text-slate-500">Loading tasks&hellip;</p>
        )}
      </main>

      {authMode && (
        <AuthDialog
          mode={authMode}
          onSubmit={handleAuth}
          onClose={() => setAuthMode(null)}
          onSwitch={(mode) => setAuthMode(mode)}
        />
      )}

      {taskDialog && (
        <TaskDialog
          mode={taskDialog.mode}
          task={taskDialog.task}
          defaultStatus={taskDialog.defaultStatus}
          onSubmit={handleTaskSubmit}
          onDelete={requestDelete}
          onClose={() => setTaskDialog(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete task"
          message={`Delete \u201c${deleteTarget.title}\u201d? This cannot be undone.`}
          confirmLabel="Delete"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
