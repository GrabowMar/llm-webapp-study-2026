import { useEffect, useMemo, useState } from "react";
import AuthModal from "./components/AuthModal";
import CalendarView from "./components/CalendarView";
import ConfirmDialog from "./components/ConfirmDialog";
import EventDetailsModal from "./components/EventDetailsModal";
import EventFormModal from "./components/EventFormModal";
import {
  CalendarEvent,
  clearSession,
  deleteEvent,
  getStoredUsername,
  getToken,
  listEvents,
  storeSession,
} from "./lib/api";
import {
  addDays,
  addMonths,
  MS_PER_HOUR,
  periodLabel,
  startOfDay,
  startOfMonth,
  startOfWeek,
  ViewMode,
} from "./lib/datetime";

type FormState =
  | { mode: "create" }
  | { mode: "edit"; event: CalendarEvent };

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() =>
    getStoredUsername(),
  );
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState<"signin" | "register" | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const range = useMemo(() => {
    if (view === "day") {
      const start = startOfDay(anchor);
      return { start, end: addDays(start, 1) };
    }
    if (view === "week") {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 7) };
    }
    const start = startOfWeek(startOfMonth(anchor));
    return { start, end: addDays(start, 42) };
  }, [view, anchor]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    listEvents({ start: range.start.toISOString(), end: range.end.toISOString() })
      .then((data) => {
        if (!cancelled) {
          setEvents(data.items);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setEvents([]);
          setLoadError(error instanceof Error ? error.message : "Failed to load events");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);

  function refresh() {
    setRefreshKey((key) => key + 1);
  }

  function shiftPeriod(direction: -1 | 1) {
    setAnchor((previous) => {
      if (view === "month") {
        return addMonths(previous, direction);
      }
      if (view === "week") {
        return addDays(previous, 7 * direction);
      }
      return addDays(previous, direction);
    });
  }

  function signIn(tokenValue: string, usernameValue: string) {
    storeSession(tokenValue, usernameValue);
    setToken(tokenValue);
    setUsername(usernameValue);
    setAuthOpen(null);
  }

  function signOut() {
    clearSession();
    setToken(null);
    setUsername(null);
    setSelected(null);
    setForm(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEvent(pendingDelete.id);
      setPendingDelete(null);
      setSelected(null);
      refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete event",
      );
    } finally {
      setDeleting(false);
    }
  }

  const signedIn = Boolean(token);
  const canEdit = signedIn;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
              Event Calendar
            </h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous period"
                onClick={() => shiftPeriod(-1)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setAnchor(startOfDay(new Date()))}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next period"
                onClick={() => shiftPeriod(1)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                ›
              </button>
            </div>
            <span className="text-sm font-semibold text-slate-800 sm:text-base">
              {periodLabel(view, anchor)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
            <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
              {(["month", "week", "day"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
                    view === mode
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>

            {signedIn && (
              <button
                type="button"
                onClick={() => setForm({ mode: "create" })}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                New event
              </button>
            )}

            {signedIn ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-slate-600 sm:inline">
                  Signed in as{" "}
                  <span className="font-medium text-slate-900">{username}</span>
                </span>
                <span className="text-sm font-medium text-slate-900 sm:hidden">
                  {username}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            ) : (
              !authOpen && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthOpen("signin")}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthOpen("register")}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Register
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        {loadError && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {loadError}
          </div>
        )}
        <CalendarView
          view={view}
          anchor={anchor}
          events={events}
          onSelectEvent={(event) => setSelected(event)}
          onSelectDay={(day) => {
            setAnchor(day);
            setView("day");
          }}
        />
      </main>

      {authOpen && (
        <AuthModal
          initialMode={authOpen}
          onClose={() => setAuthOpen(null)}
          onSignedIn={signIn}
        />
      )}

      {selected && !pendingDelete && (
        <EventDetailsModal
          event={selected}
          canEdit={canEdit}
          onEdit={() => setForm({ mode: "edit", event: selected })}
          onDelete={() => {
            setDeleteError(null);
            setPendingDelete(selected);
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {form && (
        <EventFormModal
          mode={form.mode}
          event={form.mode === "edit" ? form.event : undefined}
          defaultStart={new Date(anchor.getTime() + 9 * MS_PER_HOUR)}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            setSelected((current) =>
              current && current.id === saved.id ? saved : current,
            );
            refresh();
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete event"
          message={`Delete “${pendingDelete.title}”? This cannot be undone.`}
          confirmLabel="Delete"
          error={deleteError}
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
