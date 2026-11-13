import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import AuthForm from "./AuthForm";
import Calendar from "./Calendar";
import { range, shift, startOfDay, title } from "./dates";
import EventDetails from "./EventDetails";
import EventForm from "./EventForm";
import type { CalEvent, Session, ViewMode } from "./types";
import { Button } from "./ui";

const STORAGE_KEY = "calendar-session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s?.token === "string" && typeof s?.username === "string") {
      api.setToken(s.token);
      return s;
    }
  } catch {
    return null;
  }
  return null;
}

type Dialog =
  | { kind: "auth"; mode: "login" | "register" }
  | { kind: "details"; event: CalEvent }
  | { kind: "form"; event: CalEvent | null; start: Date }
  | null;

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [view, setView] = useState<ViewMode>("month");
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const signOutLocal = useCallback(() => {
    api.setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(signOutLocal);
    if (localStorage.getItem(STORAGE_KEY)) api.me().catch(() => {});
  }, [signOutLocal]);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = range(date, view);
    api
      .listEvents(start.toISOString(), end.toISOString())
      .then((res) => {
        if (!cancelled) {
          setEvents(res.items);
          setLoadError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load events");
      });
    return () => {
      cancelled = true;
    };
  }, [date, view, reloadKey]);

  function signedIn(token: string, username: string) {
    api.setToken(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, username }));
    setSession({ token, username });
    setDialog(null);
  }

  async function signOut() {
    try {
      await api.logout();
    } catch {
      // token may already be invalid; sign out locally regardless
    }
    signOutLocal();
    setDialog(null);
  }

  function newEvent(day?: Date) {
    const base = day ? new Date(day) : new Date();
    if (day) base.setHours(9, 0, 0, 0);
    else {
      base.setMinutes(0, 0, 0);
      base.setHours(base.getHours() + 1);
    }
    setDialog({ kind: "form", event: null, start: base });
  }

  function pickDay(d: Date) {
    setDate(d);
    setView("day");
  }

  const reload = () => setReloadKey((k) => k + 1);
  const views: ViewMode[] = ["month", "week", "day"];

  return (
    <div className="mx-auto min-h-screen max-w-6xl p-4 text-slate-900">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Event Calendar</h1>
        <div className="flex items-center gap-2 text-sm">
          {session ? (
            <>
              <span>
                Signed in as <strong data-testid="username">{session.username}</strong>
              </span>
              <Button onClick={signOut}>Sign out</Button>
            </>
          ) : (
            <>
              <Button onClick={() => setDialog({ kind: "auth", mode: "login" })}>Sign in</Button>
              <Button variant="primary" onClick={() => setDialog({ kind: "auth", mode: "register" })}>
                Register
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setDate(startOfDay(new Date()))}>Today</Button>
        <Button aria-label="Previous" onClick={() => setDate(shift(date, view, -1))}>
          ‹
        </Button>
        <Button aria-label="Next" onClick={() => setDate(shift(date, view, 1))}>
          ›
        </Button>
        <h2 className="mx-2 text-lg font-semibold" data-testid="period-title">
          {title(date, view)}
        </h2>
        <div className="ml-auto flex gap-1">
          {views.map((v) => (
            <Button
              key={v}
              variant={v === view ? "primary" : "secondary"}
              aria-pressed={v === view}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
        {session && (
          <Button variant="primary" onClick={() => newEvent(view === "day" ? date : undefined)}>
            New event
          </Button>
        )}
      </div>

      {loadError && (
        <p role="alert" className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">
          {loadError}
        </p>
      )}

      <Calendar
        view={view}
        date={date}
        events={events}
        onSelect={(event) => setDialog({ kind: "details", event })}
        onPickDay={pickDay}
      />

      {dialog?.kind === "auth" && (
        <AuthForm
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSignedIn={signedIn}
          onSwitch={(mode) => setDialog({ kind: "auth", mode })}
        />
      )}
      {dialog?.kind === "details" && (
        <EventDetails
          event={dialog.event}
          signedIn={!!session}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ kind: "form", event: dialog.event, start: new Date() })}
          onDeleted={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
      {dialog?.kind === "form" && session && (
        <EventForm
          event={dialog.event}
          defaultStart={dialog.start}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
