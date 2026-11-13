import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, api, clearSession, loadSession, saveSession } from "./api";
import { AuthPanel } from "./components/AuthPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { EventDetailsModal } from "./components/EventDetailsModal";
import { EventFormModal } from "./components/EventFormModal";
import type { EventFormValues } from "./components/EventFormModal";
import { MonthView } from "./components/MonthView";
import { TimeGrid } from "./components/TimeGrid";
import {
  addDays,
  addMonths,
  dateKey,
  formatDayTitle,
  formatMonthTitle,
  formatWeekTitle,
  minutesOfDay,
  parseIso,
  startOfDay,
  startOfMonth,
  startOfWeek,
  timeKey,
  todayUtc,
} from "./lib/dates";
import type { CalendarEvent, Session, ViewMode } from "./types";

const VIEW_TABS: { id: ViewMode; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

interface VisibleRange {
  start: Date;
  end: Date;
  days: Date[];
}

function visibleRange(view: ViewMode, anchor: Date): VisibleRange {
  if (view === "month") {
    const first = startOfWeek(startOfMonth(anchor));
    const days = Array.from({ length: 42 }, (_, index) => addDays(first, index));
    return { start: days[0], end: days[days.length - 1], days };
  }
  if (view === "week") {
    const first = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
    return { start: days[0], end: days[days.length - 1], days };
  }
  const day = startOfDay(anchor);
  return { start: day, end: day, days: [day] };
}

function defaultValues(day: Date, minutes: number): EventFormValues {
  const start = new Date(day.getTime() + minutes * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    title: "",
    description: "",
    location: "",
    start: `${dateKey(start)}T${timeKey(start)}`,
    end: `${dateKey(end)}T${timeKey(end)}`,
  };
}

function nextHalfHour(): { day: Date; minutes: number } {
  const now = new Date();
  const minutes = Math.ceil((now.getUTCHours() * 60 + now.getUTCMinutes()) / 30) * 30;
  const day = startOfDay(now);
  return { day, minutes };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(() => todayUtc());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [formState, setFormState] = useState<{
    mode: "create" | "edit";
    event?: CalendarEvent;
    initial: EventFormValues;
  } | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");

  const range = useMemo(() => visibleRange(view, anchor), [view, anchor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listEvents({
        start_date: dateKey(range.start),
        end_date: dateKey(range.end),
      })
      .then((data) => {
        if (cancelled) return;
        setEvents(data.items);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ApiError ? error.message : "The events could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, reloadToken]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dateKey(parseIso(event.start_time));
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [events]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const handleSignedIn = (next: Session) => {
    saveSession(next.token, next.username);
    setSession(next);
    setNotice(`Signed in as ${next.username}.`);
  };

  const handleSignOut = () => {
    clearSession();
    setSession(null);
    setSelected(null);
    setFormState(null);
    setDeleting(null);
    setNotice("You have been signed out.");
  };

  const goToPrevious = () => {
    if (view === "month") setAnchor((current) => addMonths(current, -1));
    else if (view === "week") setAnchor((current) => addDays(current, -7));
    else setAnchor((current) => addDays(current, -1));
  };

  const goToNext = () => {
    if (view === "month") setAnchor((current) => addMonths(current, 1));
    else if (view === "week") setAnchor((current) => addDays(current, 7));
    else setAnchor((current) => addDays(current, 1));
  };

  const goToToday = () => setAnchor(todayUtc());

  const showDay = (day: Date) => {
    setAnchor(startOfDay(day));
    setView("day");
  };

  const scrollToAuth = () => {
    document.getElementById("auth-panel")?.scrollIntoView?.({ behavior: "smooth" });
  };

  const openCreateForm = (day: Date, minutes?: number) => {
    if (!session) {
      setAuthTab("login");
      scrollToAuth();
      return;
    }
    const slot = minutes ?? 0;
    const base = minutes === undefined ? nextHalfHour() : { day: startOfDay(day), minutes: slot };
    setFormState({ mode: "create", initial: defaultValues(base.day, base.minutes) });
  };

  const openEditForm = (event: CalendarEvent) => {
    setSelected(null);
    setFormState({ mode: "edit", event, initial: defaultValues(startOfDay(parseIso(event.start_time)), minutesOfDay(event.start_time)) });
  };

  const handleSaved = (event: CalendarEvent) => {
    setFormState(null);
    setNotice(
      formState?.mode === "edit" ? "The event was updated." : `“${event.title}” was added.`,
    );
    refresh();
  };

  const handleDeleted = () => {
    const title = deleting?.title ?? "Event";
    setDeleting(null);
    setSelected(null);
    setNotice(`“${title}” was deleted.`);
    refresh();
  };

  const title =
    view === "month"
      ? formatMonthTitle(anchor)
      : view === "week"
        ? formatWeekTitle(startOfWeek(anchor))
        : formatDayTitle(anchor);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Event Calendar</h1>
              <p className="text-xs text-slate-500">A shared calendar for the whole team</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {session ? (
              <>
                <span className="hidden items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 sm:flex">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold uppercase text-white">
                    {session.username.slice(0, 1)}
                  </span>
                  <span>
                    Signed in as <span className="font-semibold">{session.username}</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("login");
                    scrollToAuth();
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab("register");
                    scrollToAuth();
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 sm:px-6">
        {notice ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {!session ? (
          <AuthPanel
            activeTab={authTab}
            onTabChange={setAuthTab}
            onSignedIn={handleSignedIn}
          />
        ) : null}

        <section className="mt-6" aria-label="Calendar">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
                role="tablist"
                aria-label="Calendar view"
              >
                {VIEW_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={view === tab.id}
                    onClick={() => setView(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      view === tab.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={goToPrevious}
                  aria-label="Previous period"
                  className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  aria-label="Next period"
                  className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <h2 className="ml-1 text-lg font-semibold text-slate-800">{title}</h2>
            </div>

            <div className="flex items-center gap-3">
              {loading ? <span className="text-xs text-slate-500">Loading…</span> : null}
              {session ? (
                <button
                  type="button"
                  onClick={() => openCreateForm(anchor)}
                  className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                >
                  + New event
                </button>
              ) : (
                <span className="text-xs text-slate-500">
                  Sign in to create and edit events.
                </span>
              )}
            </div>
          </div>

          {loadError ? (
            <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
          ) : null}

          {view === "month" ? (
            <MonthView
              days={range.days}
              eventsByDay={eventsByDay}
              canCreate={Boolean(session)}
              onSelectEvent={setSelected}
              onShowDay={showDay}
              onCreateAt={(day) => openCreateForm(day, 9 * 60)}
            />
          ) : (
            <TimeGrid
              days={range.days}
              eventsByDay={eventsByDay}
              canCreate={Boolean(session)}
              onSelectEvent={setSelected}
              onCreateAt={(day, minutes) => openCreateForm(day, minutes)}
            />
          )}

          <p className="mt-4 text-center text-xs text-slate-500">
            {events.length} event{events.length === 1 ? "" : "s"} in this period · times shown in
            UTC
          </p>
        </section>
      </main>

      {selected ? (
        <EventDetailsModal
          event={selected}
          canEdit={Boolean(session)}
          onClose={() => setSelected(null)}
          onEdit={() => openEditForm(selected)}
          onDelete={() => setDeleting(selected)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          event={deleting}
          onCancel={() => setDeleting(null)}
          onConfirmed={handleDeleted}
        />
      ) : null}

      {formState ? (
        <EventFormModal
          mode={formState.mode}
          event={formState.event}
          initial={formState.initial}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
