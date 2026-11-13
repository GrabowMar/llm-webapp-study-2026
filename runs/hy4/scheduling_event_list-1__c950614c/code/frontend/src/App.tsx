import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  clearSession,
  fetchEvents,
  fetchMe,
  getToken,
  login,
  logout,
  register,
  storeSession,
  type CalendarEvent,
} from "./api";
import AuthForm from "./components/AuthForm";
import { DayView, MonthView, WeekView } from "./components/CalendarViews";
import EventDetails from "./components/EventDetails";
import EventForm from "./components/EventForm";
import Modal from "./components/Modal";
import {
  dateKey,
  eventOverlapsPeriod,
  getPeriod,
  periodTitle,
  shiftPeriod,
  type ViewMode,
} from "./date";

const MODES: ViewMode[] = ["month", "week", "day"];

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [mode, setMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [formState, setFormState] = useState<{
    event: CalendarEvent | null;
    defaultStart?: Date;
  } | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [toast, setToast] = useState("");

  const loadEvents = useCallback(async () => {
    const period = getPeriod(anchor, mode);
    const startDate = dateKey(period.start);
    const endDate = dateKey(period.end);
    setLoading(true);
    setLoadError("");
    try {
      const result = await fetchEvents(startDate, endDate);
      setEvents(
        result.items.filter((item) => eventOverlapsPeriod(item, period)),
      );
    } catch (error) {
      setLoadError(
        error instanceof ApiError
          ? error.message
          : "Could not load events. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [anchor, mode]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthReady(true);
      return;
    }
    fetchMe()
      .then((result) => setUsername(result.username))
      .catch(() => {
        clearSession();
        setUsername(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleAuthenticated = (token: string, name: string) => {
    storeSession(token, name);
    setUsername(name);
    setAuthMode(null);
    setToast(`Welcome, ${name}!`);
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // clearing locally is enough even if the server request fails
    }
    clearSession();
    setUsername(null);
    setConfirmSignOut(false);
    setSelected(null);
    setFormState(null);
    setToast("Signed out.");
  };

  const handleSaved = () => {
    setFormState(null);
    setSelected(null);
    loadEvents();
    setToast(formState?.event ? "Event updated." : "Event created.");
  };

  const handleDeleted = () => {
    setSelected(null);
    loadEvents();
    setToast("Event deleted.");
  };

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (authMode && !username) {
    return (
      <AuthForm
        mode={authMode}
        submit={authMode === "login" ? login : register}
        onSuccess={handleAuthenticated}
        onSwitchMode={setAuthMode}
        onCancel={() => setAuthMode(null)}
      />
    );
  }

  const signedIn = username !== null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">
              Event Calendar
            </span>
          </div>

          <div className="flex items-center gap-2">
            {username ? (
              <>
                <span className="hidden text-sm text-slate-500 sm:inline">
                  Signed in as
                </span>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                  {username}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmSignOut(true)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Register
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous period"
              onClick={() => setAnchor(shiftPeriod(anchor, mode, -1))}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:bg-slate-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next period"
              onClick={() => setAnchor(shiftPeriod(anchor, mode, 1))}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:bg-slate-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setAnchor(new Date())}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Today
            </button>
            <h2 className="ml-2 text-lg font-semibold text-slate-900 sm:text-xl">
              {periodTitle(anchor, mode)}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              {MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                    mode === option
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            {signedIn && (
              <button
                type="button"
                onClick={() =>
                  setFormState({ event: null, defaultStart: new Date() })
                }
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                </svg>
                New event
              </button>
            )}
          </div>
        </div>

        {!signedIn && (
          <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            You are browsing as a guest.{" "}
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className="font-semibold underline"
            >
              Sign in
            </button>{" "}
            to create, edit or delete events.
          </div>
        )}

        {loadError && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadEvents}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white py-20 text-center text-slate-400">
            Loading events…
          </div>
        ) : (
          <>
            {mode === "month" && (
              <MonthView
                anchor={anchor}
                events={events}
                signedIn={signedIn}
                onSelect={setSelected}
                onCreateAt={(day) =>
                  setFormState({ event: null, defaultStart: new Date(day.getTime() + 9 * 3_600_000) })
                }
                onShowDay={(day) => {
                  setAnchor(day);
                  setMode("day");
                }}
              />
            )}
            {mode === "week" && (
              <WeekView
                anchor={anchor}
                events={events}
                signedIn={signedIn}
                onSelect={setSelected}
                onCreateAt={(date) =>
                  setFormState({ event: null, defaultStart: date })
                }
                onShowDay={(day) => {
                  setAnchor(day);
                  setMode("day");
                }}
              />
            )}
            {mode === "day" && (
              <DayView
                anchor={anchor}
                events={events}
                signedIn={signedIn}
                onSelect={setSelected}
                onCreateAt={(date) =>
                  setFormState({ event: null, defaultStart: date })
                }
                onShowDay={(day) => setAnchor(day)}
              />
            )}
            {events.length === 0 && !loadError && (
              <p className="mt-3 text-center text-sm text-slate-400">
                No events in this {mode}.
              </p>
            )}
          </>
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
        All times shown in UTC.
      </footer>

      {selected && (
        <EventDetails
          event={selected}
          signedIn={signedIn}
          onEdit={() => setFormState({ event: selected })}
          onDeleted={handleDeleted}
          onClose={() => setSelected(null)}
        />
      )}

      {formState && (
        <EventForm
          key={formState.event?.id ?? `new-${formState.defaultStart?.getTime() ?? 0}`}
          event={formState.event}
          defaultStart={formState.defaultStart}
          onSaved={handleSaved}
          onClose={() => setFormState(null)}
        />
      )}

      {confirmSignOut && (
        <Modal
          title="Sign out"
          onClose={() => setConfirmSignOut(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmSignOut(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Sign out
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Are you sure you want to sign out, {username}?
          </p>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
