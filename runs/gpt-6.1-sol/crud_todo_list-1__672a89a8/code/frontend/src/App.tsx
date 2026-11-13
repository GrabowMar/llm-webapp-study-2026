import { useCallback, useEffect, useState } from "react";
import { api, ApiError, errorMessage, formatDue, todayISO } from "./api";
import type { Priority, Todo, TodoPage, TodoValues, User } from "./api";
import Auth from "./components/Auth";
import Brand from "./components/Brand";
import DeleteDialog from "./components/DeleteDialog";
import Icon from "./components/Icon";
import type { IconName } from "./components/Icon";
import TodoForm from "./components/TodoForm";

type Tab = "all" | "open" | "completed";
const tabs: { value: Tab; label: string; icon: IconName }[] = [
  { value: "all", label: "All tasks", icon: "list" },
  { value: "open", label: "Open", icon: "circle" },
  { value: "completed", label: "Completed", icon: "circleCheck" },
];

function storedToken() {
  try { return localStorage.getItem("tidy-token"); } catch { return null; }
}

function rememberToken(token: string | null) {
  try {
    if (token) localStorage.setItem("tidy-token", token);
    else localStorage.removeItem("tidy-token");
  } catch { return; }
}

export default function App() {
  const [token, setToken] = useState<string | null>(storedToken);
  const [identity, setIdentity] = useState<{ token: string; user: User } | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [retry, setRetry] = useState(0);

  const signIn = useCallback((next: string) => {
    rememberToken(next);
    setToken(next);
    setSessionError("");
  }, []);

  const clearSession = useCallback(() => {
    rememberToken(null);
    setToken(null);
    setIdentity(null);
    setSessionError("");
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    api<User>("/auth/me", token, { signal: controller.signal })
      .then((user) => { setIdentity({ token, user }); setSessionError(""); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) clearSession();
        else setSessionError(errorMessage(error));
      });
    return () => controller.abort();
  }, [token, retry, clearSession]);

  if (!token) return <Auth onSignIn={signIn} />;
  if (!identity || identity.token !== token) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6"><Brand />{sessionError ? <><p role="alert" className="max-w-sm text-center text-sm text-muted">{sessionError}</p><div className="flex gap-3"><button onClick={() => { setSessionError(""); setRetry(retry + 1); }} className="rounded-lg bg-leaf px-4 py-2 text-sm text-white">Try again</button><button onClick={clearSession} className="rounded-lg border border-line px-4 py-2 text-sm">Back to sign in</button></div></> : <p role="status" className="text-sm text-muted">Opening your little space…</p>}</div>;
  }
  return <Workspace key={token} token={token} user={identity.user} onExpired={clearSession} />;
}

function Workspace({ token, user, onExpired }: { token: string; user: User; onExpired: () => void }) {
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState<Priority | "">("");
  const [pages, setPages] = useState(1);
  const [revision, setRevision] = useState(0);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [stats, setStats] = useState({ total: 0, open: 0 });
  const [matching, setMatching] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Todo | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState("");
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    const interval = window.setInterval(() => setToday(todayISO()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page_size: "10" });
    if (tab !== "all") query.set("completed", String(tab === "completed"));
    if (priority) query.set("priority", priority);
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [results, all, open] = await Promise.all([
          Promise.all(Array.from({ length: pages }, (_, index) => api<TodoPage>(`/todos?${query}&page=${index + 1}`, token, { signal: controller.signal }))),
          api<TodoPage>("/todos?page_size=1", token, { signal: controller.signal }),
          api<TodoPage>("/todos?completed=false&page_size=1", token, { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        const unique = new Map(results.flatMap((result) => result.items).map((todo) => [todo.id, todo]));
        setTodos([...unique.values()]);
        setMatching(results[0].total);
        setRemaining(results[results.length - 1].remaining);
        setStats({ total: all.total, open: open.total });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onExpired();
        else setError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [token, tab, priority, pages, revision, onExpired]);

  function selectTab(next: Tab) {
    setTab(next);
    setPages(1);
    setTodos([]);
    setLoading(true);
    setEditing(null);
    setMobileMenu(false);
  }

  function beginAdd() {
    setAdding(true);
    setEditing(null);
    setMobileMenu(false);
    window.setTimeout(() => document.getElementById("add-task")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  async function mutate<T>(path: string, method: string, body?: unknown) {
    try {
      return await api<T>(path, token, { method, body });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      throw error;
    }
  }

  async function save(values: TodoValues, todo?: Todo) {
    await mutate(todo ? `/todos/${todo.id}` : "/todos", todo ? "PATCH" : "POST", values);
    setAdding(false);
    setEditing(null);
    setRevision((value) => value + 1);
    setNotice(todo ? "A little update, all saved." : "Your new task is on the list.");
  }

  async function toggle(todo: Todo) {
    setPending(todo.id);
    setError("");
    setTodos((items) => items.map((item) => item.id === todo.id ? { ...item, completed: !todo.completed } : item));
    try {
      const updated = await mutate<Todo>(`/todos/${todo.id}`, "PATCH", { completed: !todo.completed });
      setTodos((items) => items.map((item) => item.id === todo.id ? updated : item));
      setRevision((value) => value + 1);
      setNotice(todo.completed ? "Task reopened. Take it at your own pace." : "One less thing. Nicely done!");
    } catch (error) {
      setTodos((items) => items.map((item) => item.id === todo.id ? todo : item));
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    await mutate(`/todos/${deleting.id}`, "DELETE");
    setDeleting(null);
    setRevision((value) => value + 1);
    setNotice("Task deleted. A little less clutter.");
  }

  async function signOut() {
    setSigningOut(true);
    try { await api("/auth/logout", token, { method: "POST" }); }
    finally { onExpired(); }
  }

  const counts = { all: stats.total, open: stats.open, completed: stats.total - stats.open };
  const progress = stats.total ? Math.round((counts.completed / stats.total) * 100) : 0;
  const date = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {mobileMenu && <button onClick={() => setMobileMenu(false)} aria-label="Close navigation" className="fixed inset-0 z-20 bg-ink/25 backdrop-blur-[2px] lg:hidden" />}
      <aside className={`${mobileMenu ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-[232px] flex-col border-r border-line bg-[#f5f7f2] lg:sticky lg:top-0 lg:flex lg:h-screen`}>
        <div className="px-7 pt-9 pb-10"><Brand /></div>
        <div className="px-4">
          <p className="mb-3 px-3 text-[10px] font-semibold tracking-[1.8px] text-[#949d91]">YOUR WORKSPACE</p>
          <button onClick={() => { selectTab("all"); setPriority(""); }} className="flex w-full items-center gap-3 rounded-lg bg-[#e5eddc] px-3 py-3 text-[13px] font-semibold text-[#386044]"><Icon name="list" className="size-[18px]" />My tasks<Icon name="chevron" className="ml-auto size-3.5 text-[#6e8a61]" /></button>
          <p className="mt-8 mb-3 px-3 text-[10px] font-semibold tracking-[1.8px] text-[#949d91]">A LITTLE OVERVIEW</p>
          <nav aria-label="Task views" className="space-y-1">
            {tabs.map((item) => <button key={item.value} onClick={() => selectTab(item.value)} aria-current={tab === item.value ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition hover:bg-[#e9eee3] ${tab === item.value ? "font-medium text-ink" : "text-muted"}`}><Icon name={item.icon} className="size-[17px]" />{item.label}<span className="ml-auto rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] text-muted">{counts[item.value]}</span></button>)}
          </nav>
        </div>
        <div className="mx-5 mt-auto mb-6 rounded-xl border border-[#e0e7d8] bg-[#edf2e6] px-4 py-5">
          <Icon name="leaf" className="mb-3 size-5 text-[#73915d]" /><p className="text-xs font-semibold">Progress, not perfection.</p><p className="mt-2 text-[11px] leading-5 text-[#858e7b]">Small steps still move you forward. You’ve got this.</p>
        </div>
        <div className="mx-5 mb-6 flex items-center gap-2.5 border-t border-[#e1e6dc] pt-5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#dfe8d3] text-xs font-semibold text-[#62724e]">{user.username.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{user.username}</p><p className="mt-0.5 text-[10px] text-muted">Your personal space</p></div><span title="Private workspace" className="ml-auto text-[#96a28e]"><Icon name="lock" className="size-3.5" /></span></div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-[78px] items-center justify-between gap-3 border-b border-line bg-white/60 px-5 sm:px-9 lg:px-11">
          <div className="flex items-center gap-3 text-xs"><button onClick={() => setMobileMenu(true)} aria-label="Open navigation" className="rounded-md p-1.5 text-muted lg:hidden"><Icon name="menu" /></button><span className="hidden text-muted sm:inline">My workspace</span><Icon name="chevron" className="hidden size-3 text-[#a8ada4] sm:block" /><span className="font-medium">My tasks</span></div>
          <div className="flex items-center gap-3 sm:gap-5"><span className="hidden items-center gap-2 text-[11px] text-muted md:flex"><Icon name="calendar" className="size-3.5" />{date}</span><span className="hidden h-5 w-px bg-line md:block" /><span className="max-w-24 truncate text-xs text-muted sm:max-w-36">{user.username}</span><button disabled={signingOut} onClick={() => void signOut().catch(() => undefined)} className="flex items-center gap-1.5 rounded-md px-1 py-2 text-[11px] text-muted transition hover:text-ink disabled:opacity-50"><Icon name="logout" className="size-3.5" />{signingOut ? "Signing out…" : "Sign out"}</button></div>
        </header>
        <main className="mx-auto max-w-[1190px] px-5 py-8 sm:px-9 sm:py-10 lg:px-11">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
            <div><p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted"><Icon name="sun" className="size-3.5 text-[#b39e56]" />A fresh little perspective</p><h1 className="text-[32px] leading-tight font-semibold tracking-[-1.3px]">My tasks<span className="text-leaf">.</span></h1><p className="mt-2 text-[13px] text-muted">A clear list. A calmer mind. Let’s take it one thing at a time.</p></div>
            <button onClick={beginAdd} className="flex items-center gap-2 rounded-lg bg-leaf px-4 py-3 text-xs font-semibold text-white shadow-[0_3px_6px_rgba(57,123,86,0.12)] transition hover:bg-[#2f6848]"><Icon name="plus" className="size-4" />New task</button>
          </div>
          <section aria-label="Your task overview" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              { label: "Still to do", count: stats.open, icon: "circle" as const, hint: "A little focus goes a long way", color: "bg-[#f4efe0] text-[#a78b46]", view: "open" as Tab },
              { label: "Checked off", count: counts.completed, icon: "circleCheck" as const, hint: "Every little win counts", color: "bg-[#e8f1e5] text-[#6b9259]", view: "completed" as Tab },
              { label: "All your tasks", count: stats.total, icon: "list" as const, hint: "Everything, in one little place", color: "bg-[#efedf6] text-[#9380b0]", view: "all" as Tab },
            ].map((stat) => <button key={stat.label} onClick={() => selectTab(stat.view)} className="rounded-xl border border-line bg-white p-5 text-left transition hover:border-[#cbd8c3]"><span className="flex items-center justify-between"><span className="text-[11px] font-medium text-muted">{stat.label}</span><span className={`flex size-8 items-center justify-center rounded-lg ${stat.color}`}><Icon name={stat.icon} className="size-[17px]" /></span></span><span className="mt-0.5 block text-[30px] font-semibold tracking-tight">{stat.count}</span><span className="mt-1 block text-[10px] text-muted">{stat.hint}</span></button>)}
          </section>
          <section className="relative mt-6 flex items-center justify-between overflow-hidden rounded-xl border border-[#dfe9d6] bg-[#edf4e7] px-6 py-6 sm:px-7">
            <div className="relative z-10"><div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[1.1px] text-[#7a8d63]"><Icon name="sparkles" className="size-3.5" /> A GENTLE REMINDER</div><h2 className="text-[19px] font-semibold tracking-[-0.5px]">You don’t have to do it all today.</h2><p className="mt-1.5 max-w-[380px] text-xs leading-5 text-[#7f8b74]">Start with one small thing. The rest will follow.</p></div>
            <div aria-hidden="true" className="relative mr-5 hidden h-24 w-32 shrink-0 sm:block"><div className="absolute right-0 bottom-0 size-24 rounded-full bg-[#dee9cd]" /><div className="absolute top-0 left-3 flex h-[91px] w-[70px] -rotate-12 flex-col gap-3 rounded-lg border border-[#c6d6b5] bg-[#f9fcf5] p-3.5 shadow-[3px_5px_0_#d5e2c7]"><div className="flex items-center gap-1.5"><span className="flex size-3 items-center justify-center rounded-sm bg-[#87a56b]"><Icon name="check" className="size-2.5 text-white" /></span><span className="h-1 w-6 rounded bg-[#c5d4b6]" /></div><div className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-[#c2d0b5]" /><span className="h-1 w-6 rounded bg-[#dbe4d0]" /></div><div className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-[#c2d0b5]" /><span className="h-1 w-4 rounded bg-[#dbe4d0]" /></div></div><Icon name="leaf" className="absolute right-0 bottom-1 size-11 -rotate-12 text-[#7f9c62]" /><Icon name="sparkles" className="absolute -top-2 right-0 size-5 text-[#9ab082]" /></div>
          </section>
          {adding && <div id="add-task" className="mt-6"><TodoForm onSave={(values) => save(values)} onCancel={() => setAdding(false)} /></div>}
          <section aria-label="Task list" className="mt-8 overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 pt-4 sm:px-6">
              <div className="flex gap-5 sm:gap-6" role="tablist" aria-label="Filter by completion">
                {tabs.map((item) => <button key={item.value} role="tab" aria-selected={tab === item.value} aria-controls="todo-panel" id={`tab-${item.value}`} onClick={() => selectTab(item.value)} className={`relative flex items-center gap-1.5 border-b-2 pt-1 pb-4 text-xs font-medium transition ${tab === item.value ? "border-leaf text-leaf" : "border-transparent text-muted hover:text-ink"}`}>{item.value === "all" ? "All" : item.label}<span className={`rounded-md px-1.5 py-0.5 text-[9px] ${tab === item.value ? "bg-mint text-leaf" : "bg-[#f3f4f1] text-muted"}`}>{counts[item.value]}</span></button>)}
              </div>
              <div className="relative mb-3"><Icon name="flag" className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted" /><select aria-label="Filter by priority" value={priority} onChange={(event) => { setPriority(event.target.value as Priority | ""); setPages(1); setTodos([]); setLoading(true); setEditing(null); }} className="appearance-none rounded-md border border-line bg-white py-2 pr-8 pl-8 text-[11px] text-muted hover:border-[#cbd8c3]"><option value="">All priorities</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select><Icon name="chevronDown" className="pointer-events-none absolute top-2.5 right-2.5 size-3 text-muted" /></div>
            </div>
            <div id="todo-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={loading}>
              {error && <div role="alert" className="mx-5 my-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700"><span>{error}</span><button onClick={() => setRevision((value) => value + 1)} className="shrink-0 font-semibold underline">Try again</button></div>}
              <div className="hidden grid-cols-[minmax(0,1fr)_110px_140px_68px] gap-4 border-b border-line bg-[#fafbf8] px-6 py-3 text-[9px] font-medium tracking-[1.1px] text-[#969d90] md:grid"><span className="pl-9">TASK</span><span>PRIORITY</span><span>DUE DATE</span><span /></div>
              {loading && todos.length === 0 ? <div role="status" className="space-y-5 px-6 py-9"><span className="sr-only">Loading your tasks</span>{[1, 2, 3].map((row) => <div key={row} className="flex animate-pulse items-center gap-4"><span className="size-5 rounded-md bg-mint" /><span className="h-3 w-2/5 rounded bg-[#f0f2ec]" /><span className="ml-auto h-5 w-16 rounded bg-[#f0f2ec]" /></div>)}</div> : todos.length === 0 && !error ? <div className="flex flex-col items-center px-6 py-14 text-center"><span className="relative mb-5 flex size-16 items-center justify-center rounded-2xl border border-[#dfe8d7] bg-[#f0f5ea] text-[#8ca674]"><Icon name={tab === "completed" ? "circleCheck" : "list"} className="size-7" /><span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-white bg-[#dce9cd]"><Icon name="sparkles" className="size-2.5 text-[#719251]" /></span></span><h3 className="text-base font-semibold tracking-tight">{priority ? "A little breathing room." : tab === "completed" ? "Your little wins will live here." : tab === "open" && stats.total ? "All caught up. Look at you!" : "A fresh page. A clear mind."}</h3><p className="mt-2 max-w-xs text-xs leading-6 text-muted">{priority ? "No tasks match this filter. Try another priority, or add something new." : tab === "completed" ? "Check off a task when it’s done. Every bit of progress counts." : tab === "open" && stats.total ? "You’ve checked off every task. Take a moment to enjoy it." : "Big plans or small reminders — get them out of your head and into your list."}</p><button onClick={priority ? () => { setPriority(""); setPages(1); } : beginAdd} className="mt-5 flex items-center gap-1.5 rounded-lg border border-[#dce5d5] bg-white px-4 py-2.5 text-xs font-medium text-leaf transition hover:bg-mint"><Icon name={priority ? "x" : "plus"} className="size-3.5" />{priority ? "Clear priority filter" : "Add your first task"}</button></div> : <div className="divide-y divide-line">
                {todos.map((todo) => editing === todo.id ? <div key={todo.id} className="p-4 sm:p-5"><TodoForm todo={todo} onSave={(values) => save(values, todo)} onCancel={() => setEditing(null)} /></div> : <TodoRow key={todo.id} todo={todo} today={today} disabled={loading || pending !== null} onToggle={() => void toggle(todo)} onEdit={() => { setEditing(todo.id); setAdding(false); }} onDelete={() => setDeleting(todo)} />)}
              </div>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#fdfefb] px-5 py-4 sm:px-6"><p className="text-[10px] text-muted">{loading ? "Refreshing your list…" : `${todos.length} of ${matching} ${matching === 1 ? "task" : "tasks"}`}<span className="mx-2 text-[#ced4c7]">·</span>{stats.open} still to do</p>{remaining > 0 && <button disabled={loading} onClick={() => setPages((value) => value + 1)} className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-[10px] font-medium transition hover:bg-mint disabled:opacity-50">{loading ? "Loading…" : "Load more"}<Icon name="chevronDown" className="size-3" /></button>}<span className="flex items-center gap-1 text-[9px] text-[#9ba491]"><Icon name="lock" className="size-3" />Only you can see this list</span></div>
            </div>
          </section>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4"><p className="flex items-center gap-1.5 text-[10px] text-[#949d8d]"><Icon name="leaf" className="size-3.5" />Little by little, a little becomes a lot.</p>{stats.total > 0 && <div className="flex items-center gap-3 text-[10px] text-muted"><span>{progress}% complete</span><progress aria-label="Overall task completion" value={counts.completed} max={stats.total} className="h-1.5 w-24 overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[#e9eee2] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#87a774] [&::-moz-progress-bar]:bg-[#87a774]" /></div>}</div>
        </main>
      </div>
      {deleting && <DeleteDialog todo={deleting} onDelete={remove} onCancel={() => setDeleting(null)} />}
      {notice && <div role="status" className="fixed right-5 bottom-5 left-5 z-40 flex items-center gap-3 rounded-xl border border-[#dbe6d3] bg-white px-4 py-3.5 shadow-lg sm:left-auto"><span className="flex size-6 items-center justify-center rounded-full bg-mint text-leaf"><Icon name="check" className="size-3.5" /></span><span className="text-xs">{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification" className="ml-3 rounded p-1 text-muted"><Icon name="x" className="size-3.5" /></button></div>}
    </div>
  );
}

function TodoRow({ todo, today, disabled, onToggle, onEdit, onDelete }: {
  todo: Todo; today: string; disabled: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const overdue = !todo.completed && !!todo.due_date && todo.due_date < today;
  const priorityStyle = { high: "bg-[#fbebe7] text-[#bd7767]", medium: "bg-[#f9f2de] text-[#ac9150]", low: "bg-[#ecf2e6] text-[#789663]" };
  return (
    <div className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-5 transition hover:bg-[#fafcf7] sm:px-6 md:grid-cols-[minmax(0,1fr)_110px_140px_68px] ${overdue ? "bg-[#fffdf9]" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <input type="checkbox" checked={todo.completed} disabled={disabled} onChange={onToggle} aria-label={`${todo.completed ? "Reopen" : "Complete"} ${todo.title}`} className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded border-[#cdd7c5] accent-leaf disabled:cursor-wait disabled:opacity-50" />
        <div className="min-w-0"><p className={`break-words text-[12px] leading-5 font-medium ${todo.completed ? "text-[#9ca493] line-through decoration-[#b5bbaa]" : "text-ink"}`}>{todo.title}</p>{todo.description && <p className={`mt-1 line-clamp-2 break-words text-[11px] leading-5 ${todo.completed ? "text-[#acb2a4]" : "text-muted"}`}>{todo.description}</p>}</div>
      </div>
      <div className="col-start-1 row-start-2 ml-8 flex items-center gap-3 md:col-start-2 md:row-start-1 md:ml-0"><span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[9px] font-medium ${priorityStyle[todo.priority]} ${todo.completed ? "opacity-60" : ""}`}><span className="size-1 rounded-full bg-current" />{todo.priority.slice(0, 1).toUpperCase() + todo.priority.slice(1)}</span><span className="text-[10px] text-muted md:hidden">{todo.due_date ? formatDue(todo.due_date) : "No due date"}{overdue && <span className="ml-1 text-[#c07860]">· Overdue</span>}</span></div>
      <div className={`hidden items-center gap-1.5 text-[10px] md:flex ${overdue ? "text-[#c07860]" : "text-[#939c89]"}`}><Icon name={overdue ? "clock" : "calendar"} className="size-3.5" />{todo.due_date ? <span>{formatDue(todo.due_date)}{overdue && <span className="mt-0.5 block text-[8px]">Overdue</span>}</span> : <span className="text-[#b4bcac]">No due date</span>}</div>
      <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 md:col-start-4"><button onClick={onEdit} disabled={disabled} aria-label={`Edit ${todo.title}`} title="Edit task" className="rounded-md p-2 text-[#a2ab99] transition hover:bg-mint hover:text-leaf disabled:opacity-40"><Icon name="pencil" className="size-3.5" /></button><button onClick={onDelete} disabled={disabled} aria-label={`Delete ${todo.title}`} title="Delete task" className="rounded-md p-2 text-[#a2ab99] transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"><Icon name="trash" className="size-3.5" /></button></div>
    </div>
  );
}
