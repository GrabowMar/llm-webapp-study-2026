import { useCallback, useEffect, useMemo, useState } from "react";
import { type Event, ApiError, api, getToken, getUsername, setSession } from "./api";
import {
  MONTHS,
  addDays,
  addMonths,
  dateKey,
  formatDayLong,
  startOfDay,
  todayUTC,
} from "./dates";
import { ConfirmModal } from "./components/Modal";
import AuthModal from "./components/AuthModal";
import DayGrid, { weekDays } from "./components/DayGrid";
import EventDetailModal from "./components/EventDetailModal";
import EventFormModal from "./components/EventFormModal";
import MonthView, { monthGrid } from "./components/MonthView";

type ViewMode = "month" | "week" | "day";

type AuthDialog = {
  kind: "auth";
  tab: "login" | "register";
};

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

function rangeFor(view: ViewMode, anchor: Date): { start: string; end: string } {
  if (view === "day") {
    const key = dateKey(anchor);
    return { start: key, end: key };
  }
  if (view === "week") {
    const days = weekDays(anchor);
    return { start: dateKey(days[0]), end: dateKey(days[6]) };
  }
  const days = monthGrid(anchor);
  return { start: dateKey(days[0]), end: dateKey(days[days.length - 1]) };
}

function periodLabel(view: ViewMode, anchor: Date): string {
  if (view === "day") return formatDayLong(anchor);
  if (view === "week") {
    const days = weekDays(anchor);
    const a = days[0];
    const b = days[6];
    const fmt = (d: Date) => `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
    return `${fmt(a)} – ${fmt(b)}, ${b.getUTCFullYear()}`;
  }
  return `${MONTHS[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`;
}

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? getUsername() : null,
  );
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(() => todayUTC());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modal, setModal] = useState<AuthDialog | null>(null);
  const [selected, setSelected] = useState<Event | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Event | null>(null);
  const [form, setForm] = useState<
    | { kind: "create"; start: string; end: string }
    | { kind: "edit"; event: Event }
    | null
  >(null);
  const [showMoreKeys, setShowMoreKeys] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api
      .listEvents(range.start, range.end)
      .then((res) => {
        if (!cancelled) {
          setEvents(res.items);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : "Failed to load events. Is the server reachable?",
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, refreshKey]);

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setAnchor((a) => {
        if (view === "month") return startOfDay(addMonths(a, dir));
        if (view === "week") return addDays(a, 7 * dir);
        return addDays(a, dir);
      });
      setShowMoreKeys(new Set());
    },
    [view],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal || form || selected || confirmDelete) return;
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.tagName === "SELECT"
      )
        return;
      if (e.key === "ArrowLeft") navigate(-1);
      else if (e.key === "ArrowRight") navigate(1);
      else if (e.key === "t" || e.key === "T") setAnchor(todayUTC());
      else if (e.key === "m" || e.key === "w" || e.key === "d")
        setView(e.key === "m" ? "month" : e.key === "w" ? "week" : "day");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, form, selected, confirmDelete, navigate]);

  function signOut() {
    api.logout().catch(() => undefined);
    setSession(null, null);
    setUsername(null);
  }

  function openCreate(start: Date, end: Date) {
    if (!username) {
      setModal({ kind: "auth", tab: "login" });
      return;
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) =>
      `${dateKey(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    setForm({ kind: "create", start: fmt(start), end: fmt(end) });
  }

  function createOnDay(day: Date) {
    const start = new Date(day.getTime() + 9 * 60 * 60_000);
    openCreate(start, new Date(start.getTime() + 60 * 60_000));
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="mr-2 flex items-center gap-2 text-lg font-bold text-indigo-700">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            Event Calendar
          </h1>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Previous period"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setAnchor(todayUTC())}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label="Next period"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              ›
            </button>
          </div>

          <div className="text-base font-semibold text-slate-800">{periodLabel(view, anchor)}</div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={`rounded-md px-3 py-1 font-medium transition ${
                    view === v.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {username ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const now = todayUTC();
                    openCreate(new Date(now.getTime() + 9 * 3_600_000), new Date(now.getTime() + 10 * 3_600_000));
                  }}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  + New event
                </button>
                <span className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModal({ kind: "auth", tab: "login" })}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ kind: "auth", tab: "register" })}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {loadError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
            <button type="button" onClick={refresh} className="ml-3 font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {loading && (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Loading events…
          </div>
        )}

        {!loading && !loadError && view === "month" && (
          <MonthView
            anchor={anchor}
            events={events}
            showMoreKeys={showMoreKeys}
            onSelect={(e) => setSelected(e)}
            onCreateOnDay={createOnDay}
            onToggleMore={(key) =>
              setShowMoreKeys((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
            onDateClick={(day) => {
              setAnchor(startOfDay(day));
              setView("day");
            }}
          />
        )}

        {!loading && !loadError && view === "week" && (
          <DayGrid
            days={weekDays(anchor)}
            events={events}
            onSelect={(e) => setSelected(e)}
            onCreateAt={(start, end) => openCreate(start, end)}
          />
        )}

        {!loading && !loadError && view === "day" && (
          <DayGrid
            days={[startOfDay(anchor)]}
            events={events}
            compact={false}
            onSelect={(e) => setSelected(e)}
            onCreateAt={(start, end) => openCreate(start, end)}
          />
        )}

        {!loading && !loadError && view !== "month" && events.length === 0 && (
          <p className="mt-3 text-center text-sm text-slate-400">
            No events in this period.
            {username ? " Click a time slot to create one." : ""}
          </p>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-6 text-center text-xs text-slate-400">
        All times shown in UTC (Z). Shortcuts: ←/→ navigate, T today, M/W/D switch view.
      </footer>

      {modal?.kind === "auth" && (
        <AuthModal
          initialTab={modal.tab}
          onAuthed={(name) => {
            setUsername(name);
            setLoadError("");
          }}
          onClose={() => setModal(null)}
        />
      )}

      {selected && (
        <EventDetailModal
          event={selected}
          canEdit={!!username}
          onEdit={(e) => {
            setSelected(null);
            setForm({ kind: "edit", event: e });
          }}
          onDelete={(e) => {
            setSelected(null);
            setConfirmDelete(e);
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete event"
          message={
            <>
              Delete <span className="font-semibold">{confirmDelete.title}</span>?
              This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={async () => {
            try {
              await api.deleteEvent(confirmDelete.id);
              setConfirmDelete(null);
              refresh();
            } catch (e) {
              setLoadError(e instanceof Error ? e.message : "Failed to delete event");
              setConfirmDelete(null);
            }
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {form?.kind === "create" && (
        <EventFormModal
          event={null}
          defaultStart={form.start}
          defaultEnd={form.end}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
          onClose={() => setForm(null)}
        />
      )}

      {form?.kind === "edit" && (
        <EventFormModal
          event={form.event}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
