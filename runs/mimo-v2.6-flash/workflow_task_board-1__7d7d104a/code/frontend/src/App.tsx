import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  ApiError,
  getToken,
  listTasks,
  logout,
  me,
  setToken,
  updateTask,
  type Counts,
  type Priority,
  type Status,
  type Task,
  type User,
} from "./api";
import AuthDialog from "./components/AuthDialog";
import BoardColumn, { PRIORITY_LABEL } from "./components/BoardColumn";
import TaskDialog from "./components/TaskDialog";

const COLUMNS: { status: Status; label: string }[] = [
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "done", label: "Done" },
];

const EMPTY_COUNTS: Counts = { todo: 0, in_progress: 0, done: 0 };

interface TaskDialogState {
  mode: "create" | "edit";
  task?: Task;
  status?: Status;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [authDialog, setAuthDialog] = useState<false | "login" | "register">(false);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ status: Status; index: number } | null>(
    null,
  );
  const dragIdRef = useRef<number | null>(null);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;

  const signedIn = user !== null;

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        setToken(null);
        setUser(null);
        setBanner("Your session is no longer valid. Please sign in again.");
        return;
      }
      setBanner(error.message);
      return;
    }
    setBanner("Something went wrong");
  }, []);

  const loadTasks = useCallback(
    async (priority: Priority | "all") => {
      try {
        const data = await listTasks(priority === "all" ? undefined : priority);
        setTasks(data.items);
        setCounts(data.counts);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError],
  );

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    me()
      .then((currentUser) => {
        if (!cancelled) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          setToken(null);
        } else if (!cancelled) {
          handleError(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handleError]);

  useEffect(() => {
    void loadTasks(priorityFilter);
  }, [priorityFilter, loadTasks]);

  const reload = useCallback(
    () => loadTasks(priorityFilter),
    [loadTasks, priorityFilter],
  );

  function clearDrag() {
    dragIdRef.current = null;
    setDragId(null);
    setDropTarget(null);
  }

  function handleDragStart(task: Task, event: DragEvent<HTMLElement>) {
    dragIdRef.current = task.id;
    setDragId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(task.id));
  }

  function handleDropAt(status: Status, originalIndex: number) {
    const draggedId = dragIdRef.current;
    clearDrag();
    if (draggedId === null) return;

    const all = tasksRef.current;
    const dragged = all.find((task) => task.id === draggedId);
    if (!dragged) return;

    const list = all.filter((task) => task.status === status);
    const sourceIndex = list.findIndex((task) => task.id === draggedId);
    let index = originalIndex;
    if (sourceIndex >= 0 && sourceIndex < index) index -= 1;
    const maxIndex = sourceIndex >= 0 ? list.length - 1 : list.length;
    index = Math.min(Math.max(index, 0), Math.max(maxIndex, 0));

    if (dragged.status === status && dragged.position === index + 1) return;

    void (async () => {
      try {
        await updateTask(draggedId, { status, position: index + 1 });
        await reload();
      } catch (error) {
        handleError(error);
      }
    })();
  }

  function handleCardDragOver(status: Status, index: number) {
    const list = tasksRef.current.filter((task) => task.status === status);
    const target = Math.min(Math.max(index, 0), list.length);
    setDropTarget((current) =>
      current && current.status === status && current.index === target
        ? current
        : { status, index: target },
    );
  }

  function handleCardDrop(status: Status, index: number) {
    handleDropAt(status, index);
  }

  function handleColumnDragOver(status: Status) {
    const list = tasksRef.current.filter((task) => task.status === status);
    handleCardDragOver(status, list.length);
  }

  function handleColumnDrop(status: Status) {
    const list = tasksRef.current.filter((task) => task.status === status);
    handleDropAt(status, list.length);
  }

  async function handleSignOut() {
    try {
      await logout();
    } catch {
      /* ignore network errors while signing out */
    }
    setToken(null);
    setUser(null);
    setBanner(null);
  }

  const filterPriority = priorityFilter === "all" ? undefined : priorityFilter;
  const visibleTotal = counts.todo + counts.in_progress + counts.done;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              K
            </span>
            <h1 className="text-lg font-semibold text-slate-800">Kanban</h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="hidden sm:inline">Priority</span>
              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value as Priority | "all")
                }
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            {signedIn ? (
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-slate-600 sm:inline">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-800">
                    {user.username}
                  </span>
                </span>
                <span className="text-sm font-medium text-slate-800 sm:hidden">
                  {user.username}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuthDialog("login")}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setAuthDialog("register")}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>

        {signedIn && (
          <div className="mx-auto flex max-w-7xl justify-end px-4 pb-2">
            <button
              type="button"
              onClick={() => setTaskDialog({ mode: "create", status: "todo" })}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + New task
            </button>
          </div>
        )}

        {banner && (
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <span>{banner}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="font-semibold hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <BoardColumn
            key={column.status}
            status={column.status}
            label={column.label}
            tasks={tasks.filter((task) => task.status === column.status)}
            count={counts[column.status]}
            signedIn={signedIn}
            dragging={dragId !== null}
            dropTarget={dropTarget}
            onAdd={(status) => setTaskDialog({ mode: "create", status })}
            onEdit={(task) => setTaskDialog({ mode: "edit", task })}
            onDragStart={handleDragStart}
            onDragEnd={clearDrag}
            onCardDragOver={handleCardDragOver}
            onCardDrop={handleCardDrop}
            onColumnDragOver={handleColumnDragOver}
            onColumnDrop={handleColumnDrop}
            onColumnLeave={() => setDropTarget(null)}
          />
        ))}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-6 text-xs text-slate-400">
        {filterPriority
          ? `Showing ${visibleTotal} ${PRIORITY_LABEL[filterPriority]} priority tasks`
          : `${tasks.length} tasks on the board`}
      </footer>

      {authDialog && (
        <AuthDialog
          mode={authDialog}
          onModeChange={(mode) => setAuthDialog(mode)}
          onClose={() => setAuthDialog(false)}
          onAuthed={(authenticatedUser) => {
            setUser(authenticatedUser);
            setAuthDialog(false);
            setBanner(null);
          }}
        />
      )}

      {taskDialog && (
        <TaskDialog
          mode={taskDialog.mode}
          task={taskDialog.task}
          defaultStatus={taskDialog.status}
          onClose={() => setTaskDialog(null)}
          onSaved={() => {
            setTaskDialog(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
