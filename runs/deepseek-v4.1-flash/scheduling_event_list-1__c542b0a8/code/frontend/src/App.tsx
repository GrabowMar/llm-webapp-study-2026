import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, listEvents } from "./api";
import type { CalendarView, EventItem } from "./types";
import {
  addDays,
  addMonths,
  fmtPeriodLabel,
  isoDay,
  monthGridStart,
  sameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  WEEKDAYS,
} from "./date";
import AuthPanel from "./components/AuthPanel";
import EventModal from "./components/EventModal";
import MonthView from "./components/MonthView";
import WeekDayColumn from "./components/WeekView";
import DayView from "./components/DayView";

const STORAGE_KEY = "calendar-auth";

interface Session {
  token: string;
  username: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.token === "string" && typeof parsed.username === "string") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  const range = useMemo(() => {
    let first: Date;
    let days: number;
    if (view === "month") {
      first = monthGridStart(anchor);
      days = 42;
    } else if (view === "week") {
      first = startOfWeek(anchor);
      days = 7;
    } else {
      first = startOfDay(anchor);
      days = 1;
    }
    return { first, days, last: addDays(first, days - 1) };
  }, [view, anchor]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    setLoading(true);
    setLoadError("");
    const start = `${isoDay(range.first)}T00:00:00Z`;
    const end = `${isoDay(addDays(range.last, 1))}T00:00:00Z`;
    listEvents(start, end, controller.signal)
      .then((data) => {
        if (id !== requestId.current) return;
        setEvents(data.items);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (id !== requestId.current) return;
        setLoadError(err instanceof ApiError ? err.message : "Could not load events.");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [range, reloadKey]);

  const authenticated = session !== null;

  function saveSession(next: Session) {
    setSession(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function signOut() {
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
    setShowAuth(false);
  }

  function goToToday() {
    setAnchor(startOfDay(new Date()));
  }

  function navigate(direction: -1 | 1) {
    setAnchor((current) => {
      if (view === "month") return startOfMonth(addMonths(current, direction));
      if (view === "week") return addDays(current, 7 * direction);
      return addDays(current, direction);
    });
  }

  const eventsFor = useCallback(
    (day: Date) => events.filter((event) => sameDay(new Date(event.start_time), day)),
    [events],
  );

  const days = useMemo(
    () => Array.from({ length: range.days }, (_, i) => addDays(range.first, i)),
    [range],
  );

  function openEvent(event: EventItem) {
    setSelected(event);
    setModalOpen(true);
  }

  function openCreate() {
    if (!authenticated) {
      setShowAuth(true);
      return;
    }
    setSelected(null);
    setModalOpen(true);
  }

  function afterSaved(saved: EventItem) {
    setModalOpen(false);
    setSelected(null);
    setReloadKey((k) => k + 1);
    void saved;
  }

  function afterDeleted() {
    setModalOpen(false);
    setSelected(null);
    setReloadKey((k) => k + 1);
  }

  const today = startOfDay(new Date());

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="mr-2 text-lg font-bold tracking-tight">Event Calendar</h1>
          <div className="flex items-center rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Previous period"
              className="rounded-l-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="border-x border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label="Next period"
              className="rounded-r-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              ›
            </button>
          </div>
          <h2 className="min-w-40 text-base font-semibold text-slate-800">
            {fmtPeriodLabel(view, anchor)}
          </h2>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  view === option.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {authenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold">{session.username}</span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading ? "Loading events…" : `${events.length} event${events.length === 1 ? "" : "s"} in view`}
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            + New event
          </button>
        </div>

        {loadError && (
          <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {loadError}
          </div>
        )}

        {view === "month" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => (
                <MonthView
                  key={isoDay(day)}
                  date={day}
                  events={eventsFor(day)}
                  isToday={sameDay(day, today)}
                  inMonth={day.getUTCMonth() === anchor.getUTCMonth()}
                  onSelect={openEvent}
                  onOpenDay={(d) => {
                    setAnchor(startOfDay(d));
                    setView("day");
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {view === "week" && (
          <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {days.map((day) => (
              <WeekDayColumn
                key={isoDay(day)}
                day={day}
                events={eventsFor(day)}
                isToday={sameDay(day, today)}
                onSelect={openEvent}
              />
            ))}
          </div>
        )}

        {view === "day" && <DayView events={eventsFor(anchor)} onSelect={openEvent} />}
      </main>

      {showAuth && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setShowAuth(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
            <AuthPanel
              onAuthenticated={(token, username) => {
                saveSession({ token, username });
                setShowAuth(false);
              }}
            />
            <button
              type="button"
              onClick={() => setShowAuth(false)}
              className="mt-3 w-full text-center text-sm text-white/80 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <EventModal
          event={selected}
          day={anchor}
          token={session?.token ?? null}
          onClose={() => {
            setModalOpen(false);
            setSelected(null);
          }}
          onSaved={afterSaved}
          onDeleted={afterDeleted}
        />
      )}
    </div>
  );
}
