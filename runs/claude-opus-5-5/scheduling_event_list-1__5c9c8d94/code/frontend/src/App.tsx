import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, clearSession, loadSession, onUnauthorized, saveSession, type CalendarEvent } from "./api";
import AuthDialog from "./components/AuthDialog";
import EventDetails from "./components/EventDetails";
import EventForm from "./components/EventForm";
import MonthView from "./components/MonthView";
import TimeGridView, { weekDays } from "./components/TimeGridView";
import {
  fromDateParam,
  periodTitle,
  shiftCursor,
  startOfDay,
  toDateParam,
  visibleRange,
  type ViewMode,
} from "./dates";

type Dialog =
  | { kind: "auth"; mode: "login" | "register" }
  | { kind: "details"; event: CalendarEvent }
  | { kind: "create"; start?: Date }
  | { kind: "edit"; event: CalendarEvent }
  | null;

const VIEWS: ViewMode[] = ["month", "week", "day"];

function readUrlState(): { view: ViewMode; cursor: Date } {
  const params = new URLSearchParams(window.location.search);
  const v = params.get("view");
  const view = VIEWS.includes(v as ViewMode) ? (v as ViewMode) : "month";
  const cursor = fromDateParam(params.get("date")) ?? startOfDay(new Date());
  return { view, cursor };
}

function defaultCreateStart(cursor: Date): Date {
  const now = new Date();
  const base = startOfDay(cursor);
  if (base.getTime() === startOfDay(now).getTime()) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
  }
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9);
}

export default function App() {
  const initial = useMemo(readUrlState, []);
  const [view, setView] = useState<ViewMode>(initial.view);
  const [cursor, setCursor] = useState<Date>(initial.cursor);
  const [session, setSession] = useState(loadSession);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<string | null>(null);

  const signOutLocal = useCallback((message?: string) => {
    clearSession();
    setSession(null);
    setDialog((d) => (d && (d.kind === "create" || d.kind === "edit") ? null : d));
    if (message) setToast(message);
  }, []);

  useEffect(() => {
    onUnauthorized(() => signOutLocal("Your session has expired. Please sign in again."));
    return () => onUnauthorized(null);
  }, [signOutLocal]);

  useEffect(() => {
    if (loadSession()) api.me().catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("date", toDateParam(cursor));
    const url = `${window.location.pathname}?${params}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", url);
    }
  }, [view, cursor]);

  const range = useMemo(() => visibleRange(view, cursor), [view, cursor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .listEvents(range.start.toISOString(), range.end.toISOString())
      .then((res) => {
        if (!cancelled) setEvents(res.items);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Could not load events.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, reloadKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") setCursor((c) => shiftCursor(view, c, -1));
      else if (e.key === "ArrowRight") setCursor((c) => shiftCursor(view, c, 1));
      else if (e.key === "t") setCursor(startOfDay(new Date()));
      else if (e.key === "m") setView("month");
      else if (e.key === "w") setView("week");
      else if (e.key === "d") setView("day");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, view]);

  const reload = () => setReloadKey((k) => k + 1);

  const handleSignedIn = (token: string, username: string) => {
    saveSession(token, username);
    setSession({ token, username });
    setDialog(null);
    setToast(`Signed in as ${username}`);
  };

  const handleSignOut = async () => {
    await api.logout().catch(() => undefined);
    signOutLocal("Signed out");
  };

  const goToDay = (day: Date) => {
    setCursor(startOfDay(day));
    setView("day");
  };

  const openEvent = async (event: CalendarEvent) => {
    setDialog({ kind: "details", event });
    try {
      const fresh = await api.getEvent(event.id);
      setDialog((d) => (d?.kind === "details" && d.event.id === fresh.id ? { kind: "details", event: fresh } : d));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setDialog(null);
        setToast("That event no longer exists.");
        reload();
      }
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-7 w-7 text-indigo-600" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <h1 className="text-xl font-bold tracking-tight">Event Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          {session ? (
            <>
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold text-slate-900" data-testid="current-user">{session.username}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDialog({ kind: "auth", mode: "login" })}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: "auth", mode: "register" })}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Register
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(startOfDay(new Date()))}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
          <div className="flex">
            <button
              type="button"
              onClick={() => setCursor((c) => shiftCursor(view, c, -1))}
              aria-label={`Previous ${view}`}
              title={`Previous ${view}`}
              className="rounded-l-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => shiftCursor(view, c, 1))}
              aria-label={`Next ${view}`}
              title={`Next ${view}`}
              className="-ml-px rounded-r-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <h2 className="ml-2 text-lg font-semibold" aria-live="polite">
            {periodTitle(view, cursor)}
          </h2>
          {loading && <span className="text-xs text-slate-500">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-300 bg-white p-0.5" role="group" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded px-3 py-1 text-sm font-medium capitalize ${
                  view === v ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {session && (
            <button
              type="button"
              onClick={() => setDialog({ kind: "create", start: defaultCreateStart(cursor) })}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              + New event
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mx-4 mb-3 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={reload} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1 px-4 pb-4">
        {view === "month" && (
          <MonthView cursor={cursor} events={events} onSelectEvent={openEvent} onSelectDay={goToDay} />
        )}
        {view === "week" && (
          <TimeGridView
            days={weekDays(range.start)}
            events={events}
            onSelectEvent={openEvent}
            onSelectDay={goToDay}
            onCreateAt={session ? (start) => setDialog({ kind: "create", start }) : undefined}
          />
        )}
        {view === "day" && (
          <TimeGridView
            days={[range.start]}
            events={events}
            onSelectEvent={openEvent}
            onCreateAt={session ? (start) => setDialog({ kind: "create", start }) : undefined}
          />
        )}
      </main>

      {dialog?.kind === "auth" && (
        <AuthDialog initialMode={dialog.mode} onClose={() => setDialog(null)} onSignedIn={handleSignedIn} />
      )}
      {dialog?.kind === "details" && (
        <EventDetails
          event={dialog.event}
          canEdit={!!session}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ kind: "edit", event: dialog.event })}
          onDeleted={(id) => {
            setEvents((list) => list.filter((e) => e.id !== id));
            setDialog(null);
            setToast("Event deleted");
            reload();
          }}
        />
      )}
      {dialog?.kind === "create" && session && (
        <EventForm
          defaultStart={dialog.start}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog({ kind: "details", event: saved });
            setToast("Event created");
            reload();
          }}
        />
      )}
      {dialog?.kind === "edit" && session && (
        <EventForm
          event={dialog.event}
          onClose={() => setDialog({ kind: "details", event: dialog.event })}
          onSaved={(saved) => {
            setDialog({ kind: "details", event: saved });
            setToast("Event updated");
            reload();
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
