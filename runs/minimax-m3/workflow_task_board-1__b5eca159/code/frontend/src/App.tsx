import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "./api";
import { useAuth } from "./auth";
import { AuthPanel } from "./components/AuthPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { TaskCard } from "./components/TaskCard";
import { TaskDialog } from "./components/TaskDialog";
import { COLUMNS, PRIORITIES, applyMove, matchesFilter } from "./lib/board";
import type { PriorityFilter, Status, Task } from "./types";
import { useDragAndDrop } from "./useDragAndDrop";

type DialogState = { mode: "create"; status: Status } | { mode: "edit"; task: Task } | null;

export default function App() {
  const { user, initialising, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<PriorityFilter>("all");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listTasks();
      setTasks(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getVisible = useCallback(
    (status: Status) =>
      tasks
        .filter((task) => task.status === status && matchesFilter(task, filter))
        .sort((a, b) => a.position - b.position),
    [tasks, filter],
  );

  const handleDrop = useCallback(
    async (taskId: number, status: Status, position: number) => {
      setTasks((current) => applyMove(current, taskId, status, position));
      try {
        await api.updateTask(taskId, { status, position });
        setNotice(null);
      } catch (err) {
        setNotice(err instanceof ApiError ? err.message : "Could not move the task");
      }
      void refresh();
    },
    [refresh],
  );

  const { drag, startDrag, consumeSuppressedClick } = useDragAndDrop({
    enabled: Boolean(user),
    getVisible,
    onDrop: handleDrop,
  });

  const openTask = useCallback((task: Task) => {
    if (consumeSuppressedClick()) {
      return;
    }
    if (!user) {
      return;
    }
    setDialog({ mode: "edit", task });
  }, [consumeSuppressedClick, user]);

  const visibleCounts = useMemo(() => {
    const counts: Record<Status, number> = { todo: 0, in_progress: 0, done: 0 };
    for (const task of tasks) {
      if (matchesFilter(task, filter) && task.status in counts) {
        counts[task.status] += 1;
      }
    }
    return counts;
  }, [tasks, filter]);

  const totalVisible = tasks.filter((task) => matchesFilter(task, filter)).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Kanban Board</h1>
            <p className="text-sm text-slate-500">
              {totalVisible} {totalVisible === 1 ? "task" : "tasks"} across To Do, In Progress and
              Done
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
                  Signed in as <span className="font-semibold text-slate-900">{user.username}</span>
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-sm text-slate-500">
                {initialising ? "Checking session…" : "Viewing as guest"}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {!user && !initialising ? <AuthPanel /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <label htmlFor="priority-filter" className="text-sm font-medium text-slate-700">
              Priority
            </label>
            <select
              id="priority-filter"
              name="priority"
              value={filter}
              onChange={(event) => setFilter(event.target.value as PriorityFilter)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">All priorities</option>
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => setDialog({ mode: "create", status: "todo" })}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              New task
            </button>
          ) : (
            <span className="text-xs text-slate-500">Sign in to add, move and delete tasks</span>
          )}
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const visible = getVisible(column.status);
            const isTarget = Boolean(drag?.over && drag.target?.status === column.status);
            const dropIndex = isTarget && drag?.target ? drag.target.index : -1;

            let placed = 0;
            const items: ({ kind: "card"; task: Task } | { kind: "indicator" })[] = [];
            for (const task of visible) {
              if (isTarget && task.id !== drag?.taskId && placed === dropIndex) {
                items.push({ kind: "indicator" });
              }
              items.push({ kind: "card", task });
              if (task.id !== drag?.taskId) {
                placed += 1;
              }
            }
            if (isTarget && placed === dropIndex) {
              items.push({ kind: "indicator" });
            }

            return (
              <section
                key={column.status}
                data-column-section={column.status}
                className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${column.accent}`} />
                    <h2 className="text-sm font-semibold text-slate-900">{column.label}</h2>
                    <span
                      data-count={column.status}
                      className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600"
                    >
                      {visibleCounts[column.status]}
                    </span>
                  </div>
                  {user ? (
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "create", status: column.status })}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
                    >
                      Add task
                    </button>
                  ) : null}
                </div>

                <div
                  data-column={column.status}
                  className={`flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-1 transition ${
                    isTarget ? "bg-slate-200/60 ring-2 ring-slate-400/60" : ""
                  }`}
                >
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-slate-400">
                      {loading ? "Loading…" : "No tasks here yet"}
                    </p>
                  ) : null}
                  {items.map((item, index) =>
                    item.kind === "indicator" ? (
                      <div
                        key={`indicator-${index}`}
                        data-drop-indicator
                        className="h-1.5 rounded-full bg-slate-900/70"
                      />
                    ) : (
                      <TaskCard
                        key={item.task.id}
                        task={item.task}
                        draggable={Boolean(user)}
                        dragging={drag?.taskId === item.task.id}
                        onPointerDown={startDrag}
                        onOpen={openTask}
                        onDelete={setPendingDelete}
                      />
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      {dialog?.mode === "create" ? (
        <TaskDialog
          mode="create"
          defaultStatus={dialog.status}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void refresh();
          }}
        />
      ) : null}

      {dialog?.mode === "edit" ? (
        <TaskDialog
          mode="edit"
          task={dialog.task}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void refresh();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          task={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onDeleted={() => {
            setPendingDelete(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
