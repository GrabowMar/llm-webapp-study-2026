import { useEffect, useMemo, useState } from "react";
import * as api from "./api";
import AuthPanel from "./components/AuthPanel";
import { DayView, MonthView, WeekView, eventsToDayMap } from "./components/CalendarViews";
import EventDialog from "./components/EventDialog";
import {
  addDays,
  dateFromDayKey,
  dayKey,
  formatDayHeading,
  formatMonthYear,
  formatWeekLabel,
  monthGridStart,
  startOfWeek,
  todayKey,
} from "./dates";
import type { CalendarEvent, DialogState, ViewMode } from "./types";

const VIEW_MODES: ViewMode[] = ["month", "week", "day"];

export default function App() {
  const [username, setUsername] = useState<string | null>(() => api.getStoredUsername());
  const [authOpen, setAuthOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(() => dateFromDayKey(todayKey()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [reload, setReload] = useState(0);

  const signedIn = username !== null && api.getToken() !== null;

  const range = useMemo(() => {
    if (view === "month") {
      const start = monthGridStart(anchor);
      return { start, end: addDays(start, 41) };
    }
    if (view === "week") {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 6) };
    }
    return { start: anchor, end: anchor };
  }, [view, anchor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listEvents(dayKey(range.start), dayKey(range.end))
      .then((res) => {
        if (!cancelled) {
          setEvents(res.items);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load events");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, reload]);

  const eventsByDay = useMemo(() => eventsToDayMap(events), [events]);

  const monthWeeks = useMemo(() => {
    const start = monthGridStart(anchor);
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
    );
  }, [anchor]);

  const periodLabel =
    view === "month"
      ? formatMonthYear(anchor)
      : view === "week"
        ? formatWeekLabel(startOfWeek(anchor))
        : formatDayHeading(anchor);

  function shiftPeriod(direction: number) {
    if (view === "month") {
      setAnchor((a) => new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + direction, 1)));
    } else if (view === "week") {
      setAnchor((a) => addDays(a, 7 * direction));
    } else {
      setAnchor((a) => addDays(a, direction));
    }
  }

  function handleChanged() {
    setDialog(null);
    setReload((r) => r + 1);
  }

  function handleUnauthorized() {
    api.clearSession();
    setUsername(null);
    setDialog(null);
    setAuthOpen(true);
  }

  const createAt = (day: string) => {
    if (signedIn) setDialog({ kind: "create", dateKey: day });
    else setAuthOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Event Calendar</h1>

          <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1.5 font-medium capitalize ${
                  view === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftPeriod(-1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Previous"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setAnchor(dateFromDayKey(todayKey()))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftPeriod(1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="Next"
            >
              ›
            </button>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {signedIn && (
              <button
                type="button"
                onClick={() => setDialog({ kind: "create", dateKey: todayKey() })}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                + New event
              </button>
            )}
            {signedIn ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <span className="font-semibold text-slate-900">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    api.clearSession();
                    setUsername(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign in / Register
              </button>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-3">
          <h2 className="text-sm font-semibold text-slate-700">{periodLabel}</h2>
          {loading && <span className="text-xs text-slate-400">Loading…</span>}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loadError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
        )}
        {view === "month" && (
          <MonthView
            anchor={anchor}
            weeks={monthWeeks}
            eventsByDay={eventsByDay}
            onSelectEvent={(event) => setDialog({ kind: "view", event })}
            onCreateAt={createAt}
            onShowDay={(day) => {
              setView("day");
              setAnchor(dateFromDayKey(day));
            }}
            signedIn={signedIn}
          />
        )}
        {view === "week" && (
          <WeekView
            weekStart={startOfWeek(anchor)}
            eventsByDay={eventsByDay}
            onSelectEvent={(event) => setDialog({ kind: "view", event })}
            onCreateAt={createAt}
            signedIn={signedIn}
          />
        )}
        {view === "day" && (
          <DayView
            day={anchor}
            eventsByDay={eventsByDay}
            onSelectEvent={(event) => setDialog({ kind: "view", event })}
            onCreateAt={createAt}
            signedIn={signedIn}
          />
        )}
      </main>

      {authOpen && (
        <AuthPanel
          onClose={() => setAuthOpen(false)}
          onSignedIn={(name) => {
            setUsername(name);
            setAuthOpen(false);
          }}
        />
      )}

      {dialog && (
        <EventDialog
          state={dialog}
          signedIn={signedIn}
          onClose={() => setDialog(null)}
          onChanged={handleChanged}
          onEdit={(event) => setDialog({ kind: "edit", event })}
          onUnauthorized={handleUnauthorized}
        />
      )}
    </div>
  );
}
