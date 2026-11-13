import { useEffect, useState, type FormEvent } from "react";
import {
  createTodo,
  errorMessage,
  isAuthError,
  listTodos,
  removeTodo,
  updateTodo,
  type Priority,
  type Todo,
  type TodoDraft,
} from "./api";
import TodoItem from "./TodoItem";

const PAGE_SIZE = 10;

type Tab = "all" | "open" | "completed";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
];

interface Props {
  token: string;
  username: string;
  onSignOut: () => void;
}

export default function TodosView({ token, username, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");

  const [items, setItems] = useState<Todo[]>([]);
  const [page, setPage] = useState(1);
  const [remaining, setRemaining] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function handleError(error: unknown): string {
    if (isAuthError(error)) {
      onSignOut();
      return "";
    }
    return errorMessage(error);
  }

  function paramsFor(target: number): URLSearchParams {
    const params = new URLSearchParams();
    if (tab === "open") params.set("completed", "false");
    else if (tab === "completed") params.set("completed", "true");
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    params.set("page", String(target));
    params.set("page_size", String(PAGE_SIZE));
    return params;
  }

  function openCountParams(): URLSearchParams {
    return new URLSearchParams({
      completed: "false",
      page: "1",
      page_size: "1",
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setListError(null);
      try {
        const first = await listTodos(token, paramsFor(1));
        if (cancelled) return;
        setItems(first.items);
        setPage(1);
        setRemaining(first.remaining);
        const open = await listTodos(token, openCountParams());
        if (!cancelled) setOpenCount(open.total);
      } catch (error) {
        if (cancelled) return;
        const message = handleError(error);
        if (message) setListError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, priorityFilter]);

  async function refresh() {
    try {
      const first = await listTodos(token, paramsFor(1));
      let all = first.items;
      let last = first;
      for (let target = 2; target <= page; target += 1) {
        last = await listTodos(token, paramsFor(target));
        all = all.concat(last.items);
      }
      setItems(all);
      setPage(page);
      setRemaining(last.remaining);
      const open = await listTodos(token, openCountParams());
      setOpenCount(open.total);
      setActionError(null);
    } catch (error) {
      const message = handleError(error);
      if (message) setActionError(message);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await listTodos(token, paramsFor(page + 1));
      setItems((current) => current.concat(next.items));
      setPage(next.page);
      setRemaining(next.remaining);
    } catch (error) {
      const message = handleError(error);
      if (message) setActionError(message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      await createTodo(token, {
        title,
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
      });
      setTitle("");
      setDescription("");
      setDueDate("");
      await refresh();
    } catch (error) {
      const message = handleError(error);
      if (message) setAddError(message);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(todo: Todo) {
    try {
      await updateTodo(token, todo.id, { completed: !todo.completed });
    } catch (error) {
      handleError(error);
      throw error;
    }
    await refresh();
  }

  async function handleSave(todo: Todo, draft: TodoDraft) {
    try {
      await updateTodo(token, todo.id, draft);
    } catch (error) {
      handleError(error);
      throw error;
    }
    await refresh();
  }

  async function handleDelete(todo: Todo) {
    try {
      await removeTodo(token, todo.id);
    } catch (error) {
      handleError(error);
      throw error;
    }
    await refresh();
  }

  const emptyMessage =
    tab === "completed"
      ? "Nothing completed yet."
      : tab === "open"
        ? "No open todos."
        : "No todos yet. Add one above.";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-semibold text-slate-800">Todos</h1>
          <div className="flex items-center gap-3">
            <span className="max-w-40 truncate text-sm text-slate-500">
              {username}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Add a todo
          </h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs doing?"
              aria-label="Title"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optional)"
              aria-label="Description"
              rows={2}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor="add-priority"
                  className="mb-1 block text-xs font-medium text-slate-500"
                >
                  Priority
                </label>
                <select
                  id="add-priority"
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as Priority)
                  }
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="add-due"
                  className="mb-1 block text-xs font-medium text-slate-500"
                >
                  Due date
                </label>
                <input
                  id="add-due"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={adding}
                className="ml-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adding ? "Adding…" : "Add todo"}
              </button>
            </div>
            {addError && (
              <p role="alert" className="text-sm font-medium text-red-600">
                {addError}
              </p>
            )}
          </form>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filter todos"
            className="flex gap-1 rounded-lg bg-slate-200 p-1"
          >
            {TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={tab === entry.key}
                onClick={() => setTab(entry.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === entry.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Priority
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value as "all" | Priority)
              }
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </section>

        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{openCount}</span>{" "}
          {openCount === 1 ? "todo" : "todos"} open
        </p>

        {actionError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-xs font-semibold uppercase hover:text-red-900"
            >
              Dismiss
            </button>
          </div>
        )}

        {listError && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {listError}
          </p>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {emptyMessage}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={handleToggle}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}

        {remaining > 0 && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : `Load more (${remaining} left)`}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
